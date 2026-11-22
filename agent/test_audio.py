"""Run: uv run python -m unittest"""
import os
import unittest
from pathlib import Path
from unittest import mock

os.environ.setdefault("AGENT_BRIDGE_SECRET", "test")
import app  # noqa: E402


class TurnDetectionTest(unittest.TestCase):
    def test_bengali_always_uses_vad_endpointing(self):
        self.assertFalse(app.use_turn_model("bn-BD", True))

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

    def test_stt_is_held_to_the_callers_language(self):
        for locale, lang in (("bn-BD", "bn"), ("en-US", "en"), ("ja-JP", "ja")):
            params = app.make_stt(locale)._params
            self.assertEqual(params.language_hints, [lang])
            self.assertTrue(params.language_hints_strict)
            self.assertEqual(params.model, app.SONIOX_MODEL)

    def test_tts_speaks_bengali_with_a_model_that_supports_it(self):
        tts = app.make_tts("bn-BD")
        self.assertEqual(tts._opts.model, app.ELEVEN_MODEL)
        self.assertEqual(tts._opts.language.language, "bn")
        self.assertNotEqual(app.ELEVEN_MODEL, "eleven_flash_v2_5")


class NeverRepliesTest(unittest.TestCase):
    def test_session_has_no_language_model(self):
        # The agent only transcribes and speaks server-signed text; adding an LLM would let it reply on its own.
        src = Path(app.__file__).read_text(encoding="utf-8")
        self.assertNotIn("llm=", src)


if __name__ == "__main__":
    unittest.main()
