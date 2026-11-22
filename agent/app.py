"""Ichido intake voice agent (LiveKit Agents).

Speech in, text out: the agent transcribes the caller in their language and publishes the
transcript to the room. The web app turns each final transcript into a draft the caller confirms.
The agent speaks only text the web server signed for this room (HMAC over "<room>\n<text>"),
relayed by the caller's client on `ichido.say`; anything else is ignored.
It never runs a conversational LLM, never decides anything, and never asks for numbers.
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, JobProcess, cli, room_io
from livekit.plugins import azure, google, silero

load_dotenv()
log = logging.getLogger("ichido-agent")

# Voices per locale come from the environment so a reviewer can swap them without a code change.
VOICES = {
    "bn-BD": os.getenv("VOICE_BN_BD", "bn-BD-NabanitaNeural"),
    "en-US": os.getenv("VOICE_EN_US", "en-US-JennyNeural"),
    "ja-JP": os.getenv("VOICE_JA_JP", "ja-JP-NanamiNeural"),
}
MAX_SAY_BYTES = 4096
BRIDGE_SECRET = os.environ["AGENT_BRIDGE_SECRET"].encode()


def signed_text(room: str, payload: str) -> str | None:
    """Return the text if its signature matches this room, else None."""
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


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session(agent_name=os.getenv("AGENT_NAME", "ichido-intake"))
async def intake(ctx: JobContext) -> None:
    meta = json.loads(ctx.job.metadata or "{}")
    locale = meta.get("locale") if meta.get("locale") in VOICES else "bn-BD"
    await ctx.connect()

    session = AgentSession(
        stt=google.STT(
            model=os.getenv("GOOGLE_STT_MODEL", "chirp_3"),
            location=os.getenv("GOOGLE_STT_LOCATION", "eu"),
            languages=[locale],
            detect_language=False,
            credentials_info=json.loads(os.environ["GOOGLE_CREDENTIALS_JSON"]),
        ),
        tts=azure.TTS(
            voice=VOICES[locale],
            language=locale,
            speech_key=os.environ["AZURE_SPEECH_KEY"],
            speech_region=os.environ["AZURE_SPEECH_REGION"],
        ),
        vad=ctx.proc.userdata["vad"],
    )

    # Only the caller relays text, and only server-signed text for this room is spoken.
    def on_say(reader: rtc.TextStreamReader, sender: str) -> None:
        if not sender.startswith("c-"):
            return

        async def speak() -> None:
            payload = await read_bounded(reader)
            text = signed_text(ctx.room.name, payload) if payload else None
            if not text:
                log.warning("ignored unsigned speech request")
                return
            session.interrupt()
            session.say(text, add_to_chat_ctx=False)

        asyncio.create_task(speak())

    ctx.room.register_text_stream_handler("ichido.say", on_say)

    await session.start(
        Agent(instructions="Transcribe the caller. Do not reply on your own."),
        room=ctx.room,
        room_options=room_io.RoomOptions(text_input=False),
        record=False,
    )
    log.info("intake started for locale %s", locale)


if __name__ == "__main__":
    cli.run_app(server)
