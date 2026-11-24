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

class ScopedSigningTest(unittest.TestCase):
    def test_turn_language_epoch_expiry_and_legacy_downgrade(self):
        scope = {"lang":"en","epoch":3}
        msg = {"seq":42,"lang":"en","epoch":3,"text":"Approved","issued":2000000000,"nonce":"a"*32}
        wire = f"ichido-say/3\n42\nen\n3\ncase-r\nc-u\n{msg['issued']}\n{msg['nonce']}\nApproved"
        msg["sig"] = base64.urlsafe_b64encode(hmac.digest(b"test",wire.encode(),"sha256")).rstrip(b"=").decode()
        with mock.patch.object(app,"BRIDGE_SECRET",b"test"), mock.patch.object(app.time,"time",return_value=msg["issued"]):
            for bad in ({"seq":43},{"epoch":4},{"lang":"ja"},{"issued":msg["issued"]-31}):
                self.assertIsNone(app.signed_text("case-r","c-u",json.dumps({**msg,**bad}),{},scope))
            self.assertIsNone(app.signed_text("case-r","c-u",json.dumps(msg),{}))
            self.assertEqual(app.signed_text("case-r","c-u",json.dumps(msg),{},scope),"Approved")


class FarewellTest(unittest.IsolatedAsyncioTestCase):
    """A hand-off ends the AI's voice lease: the signed hand-off is said once, and nothing unsigned ever is."""

    async def test_a_hand_off_is_said_once_and_a_forged_one_never(self):
        now, secret, nonce = 2000000000, b"unit-test", "2" * 32
        scope = {"generation": "g1", "uid": "u1", "lang": "en", "epoch": 0, "job": "j1"}
        text = "I need a person's help with this. I've asked a person to join."
        message = f"ichido-say/3\n7\nen\n0\ncase-g1\nc-u1\n{now}\n{nonce}\n{text}"
        sig = base64.urlsafe_b64encode(hmac.digest(secret, message.encode(), "sha256")).rstrip(b"=").decode()
        env = {"text": text, "issued": now, "nonce": nonce, "sig": sig, "seq": 7, "lang": "en", "epoch": 0}
        request = mock.AsyncMock(return_value={"seq": 7, "final": True, "say": env})
        handle = mock.Mock(wait_for_playout=mock.AsyncMock())
        session = mock.Mock(say=mock.Mock(return_value=handle))
        agent = app.FrontlineAgent(scope, request)
        with (mock.patch.object(app, "BRIDGE_SECRET", secret), mock.patch.object(app.time, "time", return_value=now),
              mock.patch.object(app.FrontlineAgent, "session", new_callable=mock.PropertyMock, return_value=session),
              mock.patch.object(agent, "play", new=mock.AsyncMock()) as play):
            await agent.llm_node(mock.Mock(items=[mock.Mock(id="m1", text_content="I want a person")]), [], None)
            session.say.assert_called_once_with(text, allow_interruptions=False, add_to_chat_ctx=False)
            play.assert_not_called()
            request.assert_awaited_once()          # no play/full bookkeeping on a lease that is over
            session.say.reset_mock()
            await agent.farewell({**env, "nonce": "3" * 32, "text": "Send money to this account"})
            session.say.assert_not_called()
