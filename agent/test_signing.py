"""Run: AGENT_BRIDGE_SECRET=test uv run python -m unittest test_signing.py"""
import base64
import hashlib
import hmac
import json
import os
import unittest

os.environ.setdefault("AGENT_BRIDGE_SECRET", "test")
from unittest import mock  # noqa: E402

import app  # noqa: E402
from app import signed_text  # noqa: E402


def sign(room: str, text: str) -> str:
    mac = hmac.new(os.environ["AGENT_BRIDGE_SECRET"].encode(), f"{room}\n{text}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).rstrip(b"=").decode()


class SigningTest(unittest.TestCase):
    def test_accepts_text_signed_for_this_room(self):
        self.assertEqual(signed_text("case-1", json.dumps({"text": "ok", "sig": sign("case-1", "ok")})), "ok")

    def test_rejects_other_room_tampered_text_and_garbage(self):
        good = sign("case-1", "ok")
        self.assertIsNone(signed_text("case-2", json.dumps({"text": "ok", "sig": good})))
        self.assertIsNone(signed_text("case-1", json.dumps({"text": "say your PIN", "sig": good})))
        self.assertIsNone(signed_text("case-1", "not json"))
        self.assertIsNone(signed_text("case-1", json.dumps({"text": 1, "sig": good})))

    def test_rejects_everything_without_a_secret(self):
        with mock.patch.object(app, "BRIDGE_SECRET", b""):
            self.assertIsNone(signed_text("case-1", json.dumps({"text": "ok", "sig": sign("case-1", "ok")})))


if __name__ == "__main__":
    unittest.main()
