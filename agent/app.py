"""Ichido intake voice agent (LiveKit Agents).

Speech in, text out: the agent transcribes the caller in their language and publishes the
transcript to the room. The web app turns each final transcript into a draft the caller confirms.
The agent speaks only text the caller's own client asks it to read back (`ichido.say`).
It never runs a conversational LLM, never decides anything, and never asks for numbers.
"""

import asyncio
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
MAX_SAY_CHARS = 600

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

    # Only the caller (identities issued by the token route start with "c-") may ask the agent to speak.
    def on_say(reader: rtc.TextStreamReader, sender: str) -> None:
        if not sender.startswith("c-"):
            return

        async def speak() -> None:
            text = (await reader.read_all()).strip()[:MAX_SAY_CHARS]
            if text:
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
