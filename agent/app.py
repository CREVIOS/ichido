"""Ichido voice intake. Only committed, server-signed catalogue speech reaches TTS."""

import asyncio
import base64
import hmac
import json
import logging
import os
import re
import time
import uuid

import aiohttp

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import Agent, AgentServer, AgentSession, ErrorEvent, JobContext, JobProcess, MetricsCollectedEvent, cli, metrics, room_io
from livekit.plugins import elevenlabs, silero, soniox

load_dotenv()
log = logging.getLogger("ichido-agent")
JOB_LOGS = logging.Filter(log.name)

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

# The multilingual end-of-turn model covers Japanese, English and Indonesian; Bengali and Vietnamese keep Silero VAD endpointing.
TURN_MODEL_LOCALES = {"ja-JP", "en-US", "id-ID"}

# Caller locale (sent by the web app) -> language code for Soniox hints and ElevenLabs pronunciation.
# No ne-NP: Soniox has no Nepali model (ElevenLabs v4 Turbo would speak it). Keep in step with VOICE_LANGS in the catalogue.
LANGS = {"bn-BD": "bn", "vi-VN": "vi", "id-ID": "id", "en-US": "en", "ja-JP": "ja"}
# ElevenLabs voices per language come from the environment so a reviewer can swap them without a code change.
# The default is ElevenLabs' stock voice that the LiveKit plugin ships with; eleven_v4_turbo speaks it in every
# language here. A native-speaker voice from the Voice Library sounds better; set its id here.
DEFAULT_VOICE = "hpp4J3VqNfWAUOO0d1Us"
VOICES = {
    "bn-BD": os.getenv("ELEVEN_VOICE_BN") or DEFAULT_VOICE,
    "vi-VN": os.getenv("ELEVEN_VOICE_VI") or DEFAULT_VOICE,
    "id-ID": os.getenv("ELEVEN_VOICE_ID") or DEFAULT_VOICE,
    "en-US": os.getenv("ELEVEN_VOICE_EN") or DEFAULT_VOICE,
    "ja-JP": os.getenv("ELEVEN_VOICE_JA") or DEFAULT_VOICE,
}
# eleven_flash_v2_5 cannot speak Bengali; v4 turbo can, at about 100 ms.
ELEVEN_MODEL = os.getenv("ELEVEN_MODEL") or "eleven_v4_turbo"
SONIOX_MODEL = os.getenv("SONIOX_MODEL") or "stt-rt-v6"
MAX_SAY_BYTES = 4096
SAY_WINDOW_S = 30
# Required to run a session (checked at job start); optional at import so `download-files` works without it.
BRIDGE_SECRET = os.getenv("AGENT_BRIDGE_SECRET", "").encode()


def signed_text(room: str, sender: str, payload: str, seen: dict[str, int], scope=None) -> str | None:
    """Verify and consume a read-back in this room's agent session."""
    if not BRIDGE_SECRET:
        return None
    try:
        msg = json.loads(payload)
        text, issued, nonce, sig = msg["text"], msg["issued"], msg["nonce"], msg["sig"]
    except (ValueError, KeyError, TypeError, RecursionError):
        return None
    now = int(time.time())
    if (not isinstance(text, str) or not text or type(issued) is not int or not now - SAY_WINDOW_S < issued <= now + 5
            or not isinstance(nonce, str) or not re.fullmatch(r"[0-9a-f]{32}", nonce)
            or not isinstance(sig, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}", sig)):
        return None
    try:
        version = "2"
        if scope is not None:
            seq = msg.get("seq")
            if (type(seq) is not int or seq <= 0 or msg.get("lang") != scope["lang"]
                    or type(msg.get("epoch")) is not int or msg["epoch"] != scope["epoch"]):
                return None
            version = f"3\n{seq}\n{scope['lang']}\n{scope['epoch']}"
        message = f"ichido-say/{version}\n{room}\n{sender}\n{issued}\n{nonce}\n{text}".encode()
    except UnicodeEncodeError:
        return None
    expected = base64.urlsafe_b64encode(hmac.digest(BRIDGE_SECRET, message, "sha256")).rstrip(b"=").decode()
    if not hmac.compare_digest(expected, sig):
        return None
    for used in [used for used, expires in seen.items() if expires <= now]:
        del seen[used]
    if nonce in seen or len(seen) >= 256:
        return None
    seen[nonce] = issued + SAY_WINDOW_S
    return text


class FrontlineAgent(Agent):
    def __init__(self, scope, request):
        super().__init__(instructions="Use the committed catalogue turn.")
        self.scope = scope
        self.request = request
        self.seen = {}
        self.last_final = None
        self.pending_speech = None
        self.playback = None
        self.interruptions = 0
        self.submitting = False
        self.user_speaking = False
        self.turn_task = None
        self.end_of_speech = None
        self.closing = None

    async def on_user_turn_completed(self, turn_ctx, new_message):
        # The SDK skips the default reply pipeline without an LLM. Invoke our server node on the final only.
        turn_ctx.items.append(new_message)
        self.submitting = True
        try:
            self.turn_task = asyncio.create_task(self.llm_node(turn_ctx, [], None))
            await self.turn_task
        finally:
            self.turn_task = None
            self.submitting = False

    async def llm_node(self, chat_ctx, tools, model_settings):
        message = chat_ctx.items[-1]
        request_id = str(uuid.uuid5(uuid.NAMESPACE_URL, self.scope["job"] + "/" + message.id))
        if self.last_final == request_id:
            return
        self.last_final = request_id
        generation = self.interruptions
        try:
            result = await self.request("turn", request_id=request_id, text=message.text_content)
            speech = result.get("say")
            if result.get("final"):
                # The case went to a person and this voice lease is over: say the signed hand-off once, then leave.
                self.closing = asyncio.ensure_future(self.farewell(speech))
                await self.closing
                return
            if speech and generation != self.interruptions:
                await self.request("partial", seq=speech["seq"])
            elif speech:
                await self.play(speech)
        except (aiohttp.ClientError, TimeoutError):
            await self.request("failure")

    async def watch(self, ctx, pending, played):
        try:
            while True:
                state = await self.request("state")
                if state.get("final"):
                    # The case went to a person without a spoken turn (a Help Point button confirm, a screen tap):
                    # say the signed hand-off once, then end like any other revoked lease.
                    self.interrupt()
                    if self.closing is None:
                        self.closing = asyncio.ensure_future(self.farewell(state.get("say")))
                    await asyncio.wait({self.closing}, timeout=20)
                    raise aiohttp.ClientError("voice grant ended")
                if self.pending_speech and state["seq"] != self.pending_speech:
                    self.interrupt()
                if state.get("say") and not self.pending_speech and not self.submitting:
                    task = asyncio.create_task(self.play(state["say"]))
                    pending.add(task)
                    task.add_done_callback(played)
                await asyncio.sleep(0.4 if self.pending_speech else 0.8)
        except (aiohttp.ClientError, TimeoutError):
            if self.closing is not None:
                await asyncio.wait({self.closing}, timeout=20)   # let the hand-off finish before the session ends
            self.interrupt()
            if self.turn_task:
                self.turn_task.cancel()
            ctx.shutdown("voice grant ended")

    async def farewell(self, envelope):
        text = signed_text("case-" + self.scope["generation"], "c-" + self.scope["uid"], json.dumps(envelope or {}), self.seen, self.scope)
        if not text:
            return
        try:
            await self.session.say(text, allow_interruptions=False, add_to_chat_ctx=False).wait_for_playout()
        except (RuntimeError, OSError):
            log.warning("farewell_failed", extra={"event": "farewell_failed"})

    def interrupt(self):
        self.interruptions += 1
        if self.pending_speech is not None:
            self.session.interrupt(force=True)

    async def play(self, envelope):
        if not envelope or self.user_speaking or self.pending_speech is not None:
            return
        room = "case-" + self.scope["generation"]
        seq = envelope["seq"]
        self.pending_speech = seq
        generation = self.interruptions
        try:
            await self.request("play", seq=seq)
            text = signed_text(room, "c-" + self.scope["uid"], json.dumps(envelope), self.seen, self.scope)
            if not text or generation != self.interruptions:
                await self.request("partial", seq=seq)
                return
            self.playback = None
            try:
                handle = self.session.say(text, allow_interruptions=True, add_to_chat_ctx=False)
                await handle.wait_for_playout()
            except (RuntimeError, OSError):
                await self.request("partial", seq=seq)
                return
            played = self.playback
            full = (played and played.playback_position > 0 and not played.interrupted and not handle.interrupted
                    and handle.exception() is None and generation == self.interruptions)
            await self.request("full" if full else "partial", seq=seq)
        finally:
            self.pending_speech = None


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


def turn_handling(turn_model: bool) -> dict:
    """End-of-turn detection; no preemptive generation (the session has no LLM). Without the turn model (Bengali,
    Vietnamese) a pause between two sentences must not end the caller's turn, so silence has to last longer."""
    options = {"turn_detection": MultilingualModel() if turn_model else "vad", "preemptive_generation": {"enabled": False}}
    if not turn_model:
        options["endpointing"] = {"min_delay": 1.2}
    return options


def noise_filter():
    """BVC options for the caller's microphone, or None when off or not installed."""
    if noise_cancellation is None or os.getenv("NOISE_CANCELLATION", "bvc").lower() == "off":
        return None
    return noise_cancellation.BVC()


def restrict_job_logs() -> None:
    # The SDK sends root records to stdout through the worker IPC queue, including raw provider errors.
    for handler in logging.getLogger().handlers:
        handler.addFilter(JOB_LOGS)


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()
    proc.userdata["turn_model_ready"] = turn_model_files_ready()
    if MultilingualModel is not None and not proc.userdata["turn_model_ready"]:
        log.warning("turn_detector_unavailable", extra={"event": "turn_detector_unavailable", "error": "model_files_missing"})


server.setup_fnc = prewarm


@server.rtc_session(agent_name=os.getenv("AGENT_NAME", "ichido-intake"))
async def intake(ctx: JobContext) -> None:
    restrict_job_logs()
    if not BRIDGE_SECRET:
        raise RuntimeError("AGENT_BRIDGE_SECRET is not set: the agent would have nothing it may speak")
    meta = json.loads(ctx.job.metadata or "{}")
    locale = meta.get("locale", "bn-BD")
    if locale not in VOICES:
        raise ValueError("Unsupported voice language")
    room = ctx.room.name
    if not re.fullmatch(r"case-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", room):
        raise ValueError("Invalid intake room")
    started = time.monotonic()
    log.info("job_start", extra={"event": "job_start", "room": room, "locale": locale, "job": ctx.job.id})

    async def on_end(_reason: str) -> None:
        log.info("job_end", extra={"event": "job_end", "room": room, "locale": locale,
                                   "duration_s": round(time.monotonic() - started, 1)})

    ctx.add_shutdown_callback(on_end)
    try:
        await run_intake(ctx, room, locale, meta.get("scope"))
    except Exception as e:
        log.error("job_failed", extra={"event": "job_failed", "room": room, "error": type(e).__name__})
        raise RuntimeError("Voice intake failed") from None


def wire_legacy_intake(ctx, room, locale, session):
    # Only the caller relays text, and only server-signed text for this room is spoken.
    seen: dict[str, int] = {}
    pending: set[asyncio.Task] = set()

    def on_say(reader: rtc.TextStreamReader, sender: str) -> None:
        if len(pending) >= 4:
            reader.close()
            return
        if not sender.startswith("c-"):
            reader.close()
            log.warning("say_rejected", extra={"event": "say_rejected", "room": room, "reason": "not_caller"})
            return

        async def speak() -> None:
            try:
                payload = await asyncio.wait_for(read_bounded(reader), timeout=5)
            except (TimeoutError, rtc.StreamError) as error:
                log.warning("say_stream_failed", extra={"room":room, "error":type(error).__name__})
                return
            finally:
                reader.close()
            text = signed_text(room, sender, payload, seen) if payload else None
            if not text:
                reason = "too_large" if payload is None else "unsigned"
                log.warning("say_rejected", extra={"event": "say_rejected", "room": room, "reason": reason})
                return
            log.info("say", extra={"event": "say", "room": room, "locale": locale, "chars": len(text)})
            session.interrupt()
            session.say(text, add_to_chat_ctx=False)

        task = asyncio.create_task(speak())
        pending.add(task)
        task.add_done_callback(pending.discard)

    ctx.room.register_text_stream_handler("ichido.say", on_say)


def wire_frontline(ctx, room, locale, session, scope):
    pending: set[asyncio.Task] = set()
    if scope["lang"] != LANGS[locale] or room != "case-" + scope["generation"]:
        raise ValueError("Invalid voice scope")
    scope = {**scope, "job": ctx.job.id}
    endpoint = os.environ["FRONTLINE_URL"]
    http = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=12))

    async def request(action, **fields):
        raw = json.dumps({"scope": scope, "action": action, **fields}, separators=(",", ":")).encode()
        issued = str(int(time.time()))
        sig = hmac.digest(BRIDGE_SECRET, b"ichido-job/1\n" + issued.encode() + b"\n" + raw, "sha256").hex()
        async with http.post(endpoint, data=raw, allow_redirects=False, headers={
            "Content-Type": "application/json", "x-issued": issued, "x-job-signature": sig,
        }) as response:
            response.raise_for_status()
            return await response.json()

    front = FrontlineAgent(scope, request)

    def disconnect():
        front.interrupt()
        if front.turn_task:
            front.turn_task.cancel()
        ctx.shutdown("voice connection ended")

    @ctx.room.on("participant_disconnected")
    def caller_left(participant):
        if participant.identity == "c-" + scope["uid"]:
            disconnect()

    ctx.room.on("reconnecting", disconnect)

    @session.on("user_state_changed")
    def on_user_state(ev):
        front.user_speaking = ev.new_state == "speaking"
        if front.user_speaking:
            front.interrupt()
        elif ev.old_state == "speaking":
            front.end_of_speech = time.monotonic()

    @session.on("agent_state_changed")
    def first_audio(ev):
        if ev.new_state == "speaking" and front.end_of_speech is not None:
            log.info("voice_first_audio", extra={"event":"voice_first_audio", "locale":locale, "room":room,
                     "turn":front.pending_speech, "duration_ms":round((time.monotonic()-front.end_of_speech)*1000)})
            front.end_of_speech = None

    def played(task):
        pending.discard(task)
        if not task.cancelled() and task.exception() is not None:
            front.interrupt()
            ctx.shutdown("delivery ended")

    async def cleanup():
        for task in pending:
            task.cancel()
        await asyncio.gather(*list(pending), return_exceptions=True)
        try:
            await request("end")
        except (aiohttp.ClientError, TimeoutError) as error:
            log.info("lease_ended", extra={"room":room,"error":type(error).__name__})
        finally:
            await http.close()

    ctx.add_shutdown_callback(cleanup)

    @session.on("error")
    def provider_error(ev: ErrorEvent):
        if isinstance(ev.source, soniox.STT):
            task = asyncio.create_task(request("failure"))
            pending.add(task)
            task.add_done_callback(played)
        if isinstance(ev.source, elevenlabs.TTS):
            front.interrupt()

    async def start_watch():
        session.output.audio.on("playback_finished", lambda ev: setattr(front, "playback", ev))
        await asyncio.wait_for(ctx.wait_for_participant(identity="c-" + scope["uid"]), timeout=30)
        pending.add(asyncio.create_task(front.watch(ctx, pending, played)))

    return front, start_watch


async def run_intake(ctx: JobContext, room: str, locale: str, scope=None) -> None:
    await ctx.connect()

    turn_model = use_turn_model(locale, ctx.proc.userdata.get("turn_model_ready", False))
    nc = noise_filter()
    log.info("audio_setup", extra={"event": "audio_setup", "room": room, "locale": locale,
                                   "turn_detection": "multilingual" if turn_model else "vad", "noise_cancellation": nc is not None})

    session = AgentSession(
        turn_handling=turn_handling(turn_model),
        stt=make_stt(locale),
        tts=make_tts(locale),
        vad=ctx.proc.userdata["vad"],
    )

    front = None
    if scope is None:
        wire_legacy_intake(ctx, room, locale, session)
    else:
        front, start_watch = wire_frontline(ctx, room, locale, session, scope)
        await front.request("state")

    @session.on("metrics_collected")
    def on_metrics(ev: MetricsCollectedEvent) -> None:
        m = ev.metrics
        if isinstance(m, metrics.EOUMetrics):
            log.info("stt_latency", extra={"event": "stt_latency", "room": room, "locale": locale,
                                           "transcription_delay_ms": round(m.transcription_delay * 1000),
                                           "end_of_utterance_delay_ms": round(m.end_of_utterance_delay * 1000)})
        elif isinstance(m, metrics.TTSMetrics):
            log.info("tts", extra={"event": "tts", "room": room, "locale": locale, "ttfb_ms": round(m.ttfb * 1000),
                                   "audio_s": round(m.audio_duration, 2), "chars": m.characters_count, "cancelled": m.cancelled})

    @session.on("error")
    def on_error(ev: ErrorEvent) -> None:
        # Type names only: provider error messages can echo request content.
        log.error("session_error", extra={"event": "session_error", "room": room, "source": type(ev.source).__name__,
                                          "error": type(ev.error).__name__, "recoverable": bool(getattr(ev.error, "recoverable", False))})

    await session.start(
        front or Agent(instructions="Transcribe the caller. Do not reply on your own."),
        room=ctx.room,
        room_options=room_io.RoomOptions(text_input=False, text_output=front is None,
            **({"participant_identity": "c-" + scope["uid"]} if scope else {}),
            audio_input=room_io.AudioInputOptions(noise_cancellation=nc)),
        record={"audio": False, "traces": False, "logs": False, "transcript": False, "redaction": True},
    )
    if front:
        await start_watch()


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
