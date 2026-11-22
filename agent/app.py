"""Ichido intake voice agent (LiveKit Agents).

Speech in, text out: the agent transcribes the caller in their language (Soniox) and publishes the
transcript to the room. The web app turns each final transcript into a draft the caller confirms.
The agent speaks (ElevenLabs) only text the web server signed for this room (HMAC over "<room>\n<text>"),
relayed by the caller's client on `ichido.say`; anything else is ignored.
It never runs a conversational LLM, never decides anything, and never asks for numbers.

Audio: LiveKit background voice cancellation (BVC, LiveKit Cloud only) cleans the caller's microphone, and
the multilingual turn detector ends Japanese and English turns; Bengali uses Silero VAD endpointing. Both
are optional: without the plugin or its downloaded model files the agent runs on VAD endpointing alone.

Logs: structured events on the "ichido-agent" logger (job start/end, STT and TTS timings, spoken and
rejected speech requests, errors) with room, locale, sizes and timings only, never transcripts or spoken text.
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import time

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import Agent, AgentServer, AgentSession, ErrorEvent, JobContext, JobProcess, MetricsCollectedEvent, cli, metrics, room_io
from livekit.plugins import elevenlabs, silero, soniox

load_dotenv()
log = logging.getLogger("ichido-agent")

# Optional audio extras. Both only change how the caller's audio is cleaned and when a turn ends; neither
# produces text. The agent still never replies on its own (there is no LLM in the session).
try:
    # Background voice cancellation. The model runs locally but is licensed through LiveKit Cloud only;
    # set NOISE_CANCELLATION=off on a self-hosted LiveKit server.
    from livekit.plugins import noise_cancellation
except (ImportError, OSError) as e:  # plugin not installed, or its native filter does not load on this platform
    log.warning("noise_cancellation_unavailable", extra={"event": "noise_cancellation_unavailable", "error": type(e).__name__})
    noise_cancellation = None
try:
    from livekit.plugins.turn_detector.models import HG_MODEL, MODEL_REVISIONS, ONNX_FILENAME
    from livekit.plugins.turn_detector.multilingual import MultilingualModel
except ImportError as e:
    log.warning("turn_detector_unavailable", extra={"event": "turn_detector_unavailable", "error": type(e).__name__})
    MultilingualModel = None

# The multilingual end-of-turn model covers Japanese and English; Bengali keeps Silero VAD endpointing.
TURN_MODEL_LOCALES = {"ja-JP", "en-US"}

# Caller locale (sent by the web app) -> language code for Soniox hints and ElevenLabs pronunciation.
LANGS = {"bn-BD": "bn", "en-US": "en", "ja-JP": "ja"}
# ElevenLabs voices per language come from the environment so a reviewer can swap them without a code change.
# The default is ElevenLabs' stock voice that the LiveKit plugin ships with; eleven_v4_turbo speaks it in all
# three languages. A native-speaker voice from the Voice Library sounds better; set its id here.
DEFAULT_VOICE = "hpp4J3VqNfWAUOO0d1Us"
VOICES = {
    "bn-BD": os.getenv("ELEVEN_VOICE_BN") or DEFAULT_VOICE,
    "en-US": os.getenv("ELEVEN_VOICE_EN") or DEFAULT_VOICE,
    "ja-JP": os.getenv("ELEVEN_VOICE_JA") or DEFAULT_VOICE,
}
# eleven_flash_v2_5 cannot speak Bengali; v4 turbo can, at about 100 ms.
ELEVEN_MODEL = os.getenv("ELEVEN_MODEL") or "eleven_v4_turbo"
SONIOX_MODEL = os.getenv("SONIOX_MODEL") or "stt-rt-v6"
MAX_SAY_BYTES = 4096
# Required to run a session (checked at job start); optional at import so `download-files` works without it.
BRIDGE_SECRET = os.getenv("AGENT_BRIDGE_SECRET", "").encode()


def signed_text(room: str, payload: str) -> str | None:
    """Return the text if its signature matches this room, else None. Without a secret nothing is accepted."""
    if not BRIDGE_SECRET:
        return None
    try:
        msg = json.loads(payload)
        text, sig = msg["text"], msg["sig"]
    except (ValueError, KeyError, TypeError):
        return None
    if not isinstance(text, str) or not isinstance(sig, str):
        return None
    expected = base64.urlsafe_b64encode(hmac.new(BRIDGE_SECRET, f"{room}\n{text}".encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    return text if hmac.compare_digest(expected, sig) else None


async def read_bounded(reader: rtc.TextStreamReader) -> str | None:
    """Read a text stream but give up once it exceeds MAX_SAY_BYTES."""
    parts, size = [], 0
    async for chunk in reader:
        size += len(chunk.encode())
        if size > MAX_SAY_BYTES:
            return None
        parts.append(chunk)
    return "".join(parts)

server = AgentServer()


def turn_model_files_ready() -> bool:
    """True when `download-files` has put the multilingual turn detector on disk (checked without network)."""
    if MultilingualModel is None:
        return False
    from huggingface_hub import hf_hub_download
    from huggingface_hub.errors import LocalEntryNotFoundError

    rev = MODEL_REVISIONS["multilingual"]
    try:
        for name, sub in (("languages.json", None), ("tokenizer.json", None), (ONNX_FILENAME, "onnx")):
            hf_hub_download(HG_MODEL, name, subfolder=sub, revision=rev, local_files_only=True)
    except (LocalEntryNotFoundError, OSError):
        return False
    return True


def use_turn_model(locale: str, files_ready: bool) -> bool:
    return files_ready and MultilingualModel is not None and locale in TURN_MODEL_LOCALES


def make_stt(locale: str) -> soniox.STT:
    """Soniox real-time STT held to the caller's language (SONIOX_API_KEY)."""
    return soniox.STT(params=soniox.STTOptions(model=SONIOX_MODEL, language_hints=[LANGS[locale]], language_hints_strict=True))


def make_tts(locale: str) -> elevenlabs.TTS:
    """ElevenLabs TTS (ELEVEN_API_KEY). The language code makes v4 pronounce Bengali as Bengali."""
    return elevenlabs.TTS(model=ELEVEN_MODEL, voice_id=VOICES[locale], language=LANGS[locale])


def noise_filter():
    """BVC options for the caller's microphone, or None when off or not installed."""
    if noise_cancellation is None or os.getenv("NOISE_CANCELLATION", "bvc").lower() == "off":
        return None
    return noise_cancellation.BVC()


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()
    proc.userdata["turn_model_ready"] = turn_model_files_ready()
    if MultilingualModel is not None and not proc.userdata["turn_model_ready"]:
        log.warning("turn_detector_unavailable", extra={"event": "turn_detector_unavailable", "error": "model_files_missing"})


server.setup_fnc = prewarm


@server.rtc_session(agent_name=os.getenv("AGENT_NAME", "ichido-intake"))
async def intake(ctx: JobContext) -> None:
    if not BRIDGE_SECRET:
        raise RuntimeError("AGENT_BRIDGE_SECRET is not set: the agent would have nothing it may speak")
    meta = json.loads(ctx.job.metadata or "{}")
    locale = meta.get("locale") if meta.get("locale") in VOICES else "bn-BD"
    room = ctx.room.name
    started = time.monotonic()
    log.info("job_start", extra={"event": "job_start", "room": room, "locale": locale, "job": ctx.job.id})

    async def on_end(reason: str) -> None:
        log.info("job_end", extra={"event": "job_end", "room": room, "locale": locale, "reason": reason,
                                   "duration_s": round(time.monotonic() - started, 1)})

    ctx.add_shutdown_callback(on_end)
    try:
        await run_intake(ctx, room, locale)
    except Exception as e:
        log.error("job_failed", extra={"event": "job_failed", "room": room, "error": type(e).__name__})
        raise


async def run_intake(ctx: JobContext, room: str, locale: str) -> None:
    await ctx.connect()

    turn_model = use_turn_model(locale, ctx.proc.userdata.get("turn_model_ready", False))
    nc = noise_filter()
    log.info("audio_setup", extra={"event": "audio_setup", "room": room, "locale": locale,
                                   "turn_detection": "multilingual" if turn_model else "vad", "noise_cancellation": nc is not None})

    session = AgentSession(
        turn_handling={"turn_detection": MultilingualModel() if turn_model else "vad"},
        stt=make_stt(locale),
        tts=make_tts(locale),
        vad=ctx.proc.userdata["vad"],
    )

    # Only the caller relays text, and only server-signed text for this room is spoken.
    def on_say(reader: rtc.TextStreamReader, sender: str) -> None:
        if not sender.startswith("c-"):
            log.warning("say_rejected", extra={"event": "say_rejected", "room": room, "reason": "not_caller"})
            return

        async def speak() -> None:
            payload = await read_bounded(reader)
            text = signed_text(room, payload) if payload else None
            if not text:
                reason = "too_large" if payload is None else "unsigned"
                log.warning("say_rejected", extra={"event": "say_rejected", "room": room, "reason": reason})
                return
            log.info("say", extra={"event": "say", "room": room, "locale": locale, "chars": len(text)})
            session.interrupt()
            session.say(text, add_to_chat_ctx=False)

        asyncio.create_task(speak())

    ctx.room.register_text_stream_handler("ichido.say", on_say)

    @session.on("metrics_collected")
    def on_metrics(ev: MetricsCollectedEvent) -> None:
        m = ev.metrics
        if isinstance(m, metrics.EOUMetrics):
            log.info("stt_latency", extra={"event": "stt_latency", "room": room,
                                           "transcription_delay_ms": round(m.transcription_delay * 1000),
                                           "end_of_utterance_delay_ms": round(m.end_of_utterance_delay * 1000)})
        elif isinstance(m, metrics.TTSMetrics):
            log.info("tts", extra={"event": "tts", "room": room, "ttfb_ms": round(m.ttfb * 1000),
                                   "audio_s": round(m.audio_duration, 2), "chars": m.characters_count, "cancelled": m.cancelled})

    @session.on("error")
    def on_error(ev: ErrorEvent) -> None:
        # Type names only: provider error messages can echo request content.
        log.error("session_error", extra={"event": "session_error", "room": room, "source": type(ev.source).__name__,
                                          "error": type(ev.error).__name__, "recoverable": bool(getattr(ev.error, "recoverable", False))})

    await session.start(
        Agent(instructions="Transcribe the caller. Do not reply on your own."),
        room=ctx.room,
        room_options=room_io.RoomOptions(text_input=False, audio_input=room_io.AudioInputOptions(noise_cancellation=nc)),
        record=False,
    )


def ship_logs_to_betterstack() -> None:
    """Send this agent's own logger to Better Stack when BETTERSTACK_SOURCE_TOKEN is set.

    Third-party loggers are not shipped, so no library can leak a transcript. Called in the main process
    only: LiveKit forwards job-process records to it, so each record ships once.
    """
    token = os.getenv("BETTERSTACK_SOURCE_TOKEN")
    if not token:
        return
    from logtail import LogtailHandler

    log.addHandler(LogtailHandler(source_token=token, host=os.getenv("BETTERSTACK_INGEST_HOST", "in.logs.betterstack.com")))
    log.setLevel(logging.INFO)


if __name__ == "__main__":
    ship_logs_to_betterstack()
    cli.run_app(server)
