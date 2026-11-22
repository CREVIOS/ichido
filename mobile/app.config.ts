import type { ExpoConfig } from "expo/config";

// The web origin the Help Point QR codes point at (https://<host>/s/TABLE-A). Opening one of those links
// on a phone with the app installed lands on the same pairing screen as ichido://s/TABLE-A.
const web = process.env.EXPO_PUBLIC_API_URL ? new URL(process.env.EXPO_PUBLIC_API_URL) : null;
const httpsHost = web?.protocol === "https:" ? web.host : null;

const config: ExpoConfig = {
  name: "Ichido",
  slug: "ichido",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "ichido",
  userInterfaceStyle: "light",
  backgroundColor: "#F5F5F5",
  ios: {
    bundleIdentifier: "demo.ichido.mobile",
    supportsTablet: true,
    associatedDomains: httpsHost ? [`applinks:${httpsHost}`] : undefined,
    infoPlist: {
      NSMicrophoneUsageDescription: "Ichido uses the microphone only while you press Speak, to pass what you say to the help desk.",
      // Local development talks to http://127.0.0.1 (Supabase) and http://localhost (web).
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    },
  },
  android: {
    package: "demo.ichido.mobile",
    adaptiveIcon: {
      backgroundColor: "#0A0A0A",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    permissions: ["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"],
    intentFilters: httpsHost
      ? [{ action: "VIEW", autoVerify: true, data: [{ scheme: "https", host: httpsHost, pathPrefix: "/s/" }], category: ["BROWSABLE", "DEFAULT"] }]
      : undefined,
  },
  plugins: [
    "expo-router",
    ["expo-secure-store", { faceIDPermission: false }],
    ["expo-splash-screen", { backgroundColor: "#FFFFFF", image: "./assets/images/splash-icon.png", imageWidth: 64 }],
    ["@livekit/react-native-expo-plugin", { android: { audioType: "communication" } }],
    "@config-plugins/react-native-webrtc",
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
};

export default config;
