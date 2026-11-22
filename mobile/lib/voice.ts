import { NativeModules } from "react-native";
import type * as LiveKitClient from "livekit-client";
import type * as LiveKitNative from "@livekit/react-native";

// LiveKit's WebRTC module exists only in a development build. In Expo Go the app still runs and the caller types,
// so LiveKit is required on first use and only when its native side is present (nothing touches it at import time).
export const hasVoice = NativeModules.LKRNWebRTCModule != null;

export const livekit = () => ({
  ...(require("livekit-client") as typeof LiveKitClient),
  AudioSession: (require("@livekit/react-native") as typeof LiveKitNative).AudioSession,
});

export function setupVoice() {
  if (hasVoice) (require("@livekit/react-native") as typeof LiveKitNative).registerGlobals();
}
