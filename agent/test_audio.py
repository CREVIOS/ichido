"""Run: uv run python -m unittest"""
import asyncio
import io
import logging
import os
import unittest
from pathlib import Path
from unittest import mock

os.environ.setdefault("AGENT_BRIDGE_SECRET", "test")
import app  # noqa: E402


class TurnDetectionTest(unittest.TestCase):
    def test_bengali_and_vietnamese_always_use_vad_endpointing(self):
        self.assertFalse(app.use_turn_model("bn-BD", True))
        self.assertFalse(app.use_turn_model("vi-VN", True))

    def test_indonesian_uses_the_model_when_its_files_are_on_disk(self):
        self.assertFalse(app.use_turn_model("id-ID", False))
        if app.MultilingualModel is not None:
            self.assertTrue(app.use_turn_model("id-ID", True))

    def test_japanese_and_english_use_the_model_only_when_its_files_are_on_disk(self):
        self.assertFalse(app.use_turn_model("ja-JP", False))
        self.assertFalse(app.use_turn_model("en-US", False))
        if app.MultilingualModel is not None:
            self.assertTrue(app.use_turn_model("ja-JP", True))
            self.assertTrue(app.use_turn_model("en-US", True))

    def test_missing_plugin_falls_back_to_vad(self):
        with mock.patch.object(app, "MultilingualModel", None):
            self.assertFalse(app.use_turn_model("ja-JP", True))
            self.assertFalse(app.turn_model_files_ready())


class NoiseCancellationTest(unittest.TestCase):
    def test_off_switch_and_missing_plugin_disable_it(self):
        with mock.patch.dict(os.environ, {"NOISE_CANCELLATION": "off"}):
            self.assertIsNone(app.noise_filter())
        with mock.patch.object(app, "noise_cancellation", None):
            self.assertIsNone(app.noise_filter())

    def test_on_by_default_when_installed(self):
        if app.noise_cancellation is None:
            self.skipTest("livekit-plugins-noise-cancellation not loadable here")
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("NOISE_CANCELLATION", None)
            self.assertIsNotNone(app.noise_filter())


class ProvidersTest(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.dict(os.environ, {"SONIOX_API_KEY": "test", "ELEVEN_API_KEY": "test"})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_the_sdk_accepts_the_session_options(self):
        from livekit.agents import AgentSession
        loop = asyncio.new_event_loop()
        self.addCleanup(loop.close)
        AgentSession(turn_handling=app.turn_handling(False), stt=app.make_stt("en-US"), tts=app.make_tts("en-US"), loop=loop)
        self.assertGreaterEqual(app.turn_handling(False)["endpointing"]["min_delay"], 1.0, "a pause between sentences is not a turn")

    def test_stt_is_held_to_the_callers_language(self):
        for locale, lang in (("bn-BD", "bn"), ("vi-VN", "vi"), ("id-ID", "id"), ("en-US", "en"), ("ja-JP", "ja")):
            params = app.make_stt(locale)._params
            self.assertEqual(params.language_hints, [lang])
            self.assertTrue(params.language_hints_strict)
            self.assertEqual(params.model, app.SONIOX_MODEL)

    def test_tts_speaks_bengali_with_a_model_that_supports_it(self):
        tts = app.make_tts("bn-BD")
        self.assertEqual(tts._opts.model, app.ELEVEN_MODEL)
        self.assertEqual(tts._opts.language.language, "bn")
        self.assertNotEqual(app.ELEVEN_MODEL, "eleven_flash_v2_5")

    def test_tts_language_and_voice_per_new_language(self):
        for locale, lang in (("vi-VN", "vi"), ("id-ID", "id")):
            tts = app.make_tts(locale)
            self.assertEqual(tts._opts.language.language, lang)
            self.assertEqual(tts._opts.voice_id, app.VOICES[locale])

    def test_nepali_has_no_voice_path(self):
        # Soniox cannot transcribe Nepali; the web app keeps Nepali callers on the typed path.
        self.assertNotIn("ne-NP", app.LANGS)
        self.assertNotIn("ne-NP", app.VOICES)


class WorkerLogsTest(unittest.TestCase):
    def test_stdout_or_ipc_handler_accepts_only_application_events(self):
        output = io.StringIO()
        handler = logging.StreamHandler(output)
        root = logging.getLogger()
        with mock.patch.object(root, "handlers", [handler]):
            app.restrict_job_logs()
            for name, message in (("livekit.agents", "private transcript"), ("livekit.plugins.soniox", "provider payload"),
                                  ("asyncio", "raw exception"), ("ichido-agent", "session_error")):
                root.handle(logging.LogRecord(name, logging.ERROR, __file__, 0, message, (), None))
        self.assertEqual(output.getvalue(), "session_error\n")


class NeverRepliesTest(unittest.TestCase):
    def test_session_has_no_language_model(self):
        # The agent only transcribes and speaks server-signed text; adding an LLM would let it reply on its own.
        src = Path(app.__file__).read_text(encoding="utf-8")
        self.assertNotIn("llm=", src)


class FrontlinePlaybackTest(unittest.IsolatedAsyncioTestCase):
    def agent(self):
        self.request = mock.AsyncMock(return_value={})
        self.front = app.FrontlineAgent({"uid":"u","generation":"g","job":"job","lang":"en","epoch":2}, self.request)
        self.session = mock.Mock()
        self.enterContext(mock.patch.object(app.FrontlineAgent, "session", new_callable=mock.PropertyMock, return_value=self.session))
        self.enterContext(mock.patch.object(app, "signed_text", return_value="Approved"))
        return self.front

    async def test_barge_in_stops_playout_and_records_partial(self):
        front = self.agent()
        handle = self.session.say.return_value
        handle.wait_for_playout = mock.AsyncMock(side_effect=front.interrupt)
        await front.play({"seq":1,"issued":int(app.time.time())})
        self.session.interrupt.assert_called_once_with(force=True)
        self.request.assert_awaited_with("partial",seq=1)

    async def test_revoked_before_synthesis(self):
        front = self.agent()
        self.request.side_effect = app.aiohttp.ClientError()
        with self.assertRaises(app.aiohttp.ClientError):
            await front.play({"seq":1,"issued":int(app.time.time())})
        self.session.say.assert_not_called()

    async def test_duplicate_final_keeps_request_id(self):
        front = self.agent()
        ctx = mock.Mock(items=[mock.Mock(id="final-1",text_content="My question")])
        await front.llm_node(ctx, [], None)
        await front.llm_node(ctx, [], None)
        self.request.assert_awaited_once()
        self.assertEqual(self.request.await_args.kwargs["request_id"],str(app.uuid.uuid5(app.uuid.NAMESPACE_URL,"job/final-1")))

    async def test_full_delivery_needs_completed_audio(self):
        front = self.agent()
        handle = self.session.say.return_value
        handle.interrupted = False
        handle.exception.return_value = None
        def finished():
            front.playback = mock.Mock(playback_position=1.4, interrupted=False)
        handle.wait_for_playout = mock.AsyncMock(side_effect=finished)
        await front.play({"seq":2})
        self.request.assert_awaited_with("full", seq=2)

    async def test_takeover_interrupts_in_progress_playout(self):
        front = self.agent()
        playing, stopped = asyncio.Event(), asyncio.Event()
        handle = self.session.say.return_value
        async def playout():
            playing.set()
            await stopped.wait()
        handle.wait_for_playout = playout
        self.session.interrupt.side_effect = lambda **kwargs: stopped.set()
        async def request(action, **fields):
            if action == "state":
                await playing.wait()
                raise app.aiohttp.ClientError()
            return {}
        self.request.side_effect = request
        ctx = mock.Mock()
        await asyncio.wait_for(asyncio.gather(front.play({"seq":8}), front.watch(ctx,set(),None)), timeout=1)
        ctx.shutdown.assert_called_once()
        self.request.assert_awaited_with("partial",seq=8)

    async def test_synthesis_failure_marks_the_text_only_turn_partial(self):
        front = self.agent()
        self.session.say.side_effect = RuntimeError("unavailable")
        await front.play({"seq":3})
        self.request.assert_awaited_with("partial", seq=3)

    async def test_interrupt_before_the_reply_arrives_discards_queued_audio(self):
        front = self.agent()
        async def request(action, **fields):
            if action == "turn":
                front.interrupt()
                return {"say":{"seq":4}}
            return {}
        self.request.side_effect = request
        ctx = mock.Mock(items=[mock.Mock(id="final-2", text_content="A question")])
        await front.llm_node(ctx, [], None)
        self.request.assert_awaited_with("partial",seq=4)
        self.session.say.assert_not_called()


if __name__ == "__main__":
    unittest.main()
