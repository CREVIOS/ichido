"""Speech envelopes shared with the Next.js signer."""
import base64
import hmac
import json
import os
import unittest
from unittest import mock

os.environ.setdefault("AGENT_BRIDGE_SECRET", "test")
import app  # noqa: E402


class SigningTest(unittest.TestCase):
    def setUp(self):
        self.seen = {}
        self.now = 2000000000
        self.secret = b"unit-test"
        self.enterContext(mock.patch.object(app, "BRIDGE_SECRET", self.secret))
        self.enterContext(mock.patch.object(app.time, "time", return_value=self.now))

    def envelope(self, issued=None, nonce="1" * 32):
        issued = self.now if issued is None else issued
        text = "カード\nOK"
        message = f"ichido-say/2\ncase-1\nc-2\n{issued}\n{nonce}\n{text}"
        digest = hmac.digest(self.secret, message.encode(), "sha256")
        return dict(text=text, issued=issued, nonce=nonce, sig=base64.urlsafe_b64encode(digest).rstrip(b"=").decode())

    def verify(self, message, room="case-1", sender="c-2"):
        return app.signed_text(room, sender, json.dumps(message), self.seen)

    def test_one_use_in_issuing_room_and_for_issuing_caller(self):
        msg = self.envelope()
        self.assertIsNone(self.verify(msg, room="case-2"))
        self.assertIsNone(self.verify(msg, sender="c-3"))
        for key, value in (("text", "changed"), ("issued", self.now - 1), ("nonce", "0" * 32)):
            self.assertIsNone(self.verify({**msg, key: value}))
        self.assertEqual(self.verify(msg), msg["text"])
        self.assertIsNone(self.verify(msg))
        self.assertEqual(self.verify(self.envelope(nonce="0" * 32)), msg["text"])

    def test_expired_or_future_commands(self):
        self.assertIsNone(self.verify(self.envelope(issued=self.now - app.SAY_WINDOW_S)))
        self.assertIsNone(self.verify(self.envelope(issued=self.now + 6)))
        self.assertIsNotNone(self.verify(self.envelope(issued=self.now - app.SAY_WINDOW_S + 1)))

    def test_malformed_input_and_missing_secret(self):
        msg = self.envelope()
        for bad in (None, 3, {}, {"text": "ok", "sig": msg["sig"]}, {**msg, "text": "\ud800"},
                    {**msg, "issued": True}, {**msg, "sig": "あ" * 43}):
            self.assertIsNone(self.verify(bad))
        self.assertIsNone(app.signed_text("case-1", "c-2", "invalid", self.seen))
        with mock.patch.object(app, "BRIDGE_SECRET", b""):
            self.assertIsNone(self.verify(msg))
