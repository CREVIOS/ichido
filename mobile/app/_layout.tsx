import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { DMMono_400Regular } from "@expo-google-fonts/dm-mono/400Regular";
import { DMMono_500Medium } from "@expo-google-fonts/dm-mono/500Medium";
import { HindSiliguri_400Regular } from "@expo-google-fonts/hind-siliguri/400Regular";
import { HindSiliguri_500Medium } from "@expo-google-fonts/hind-siliguri/500Medium";
import { NotoSansDevanagari_400Regular } from "@expo-google-fonts/noto-sans-devanagari/400Regular";
import { NotoSansDevanagari_500Medium } from "@expo-google-fonts/noto-sans-devanagari/500Medium";
import { NotoSansJP_400Regular } from "@expo-google-fonts/noto-sans-jp/400Regular";
import { NotoSansJP_500Medium } from "@expo-google-fonts/noto-sans-jp/500Medium";
import { color } from "@/theme";
import { setupVoice } from "@/lib/voice";

// WebRTC globals for LiveKit voice intake (development build only; see README).
setupVoice();

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular, Inter_500Medium, DMMono_400Regular, DMMono_500Medium,
    HindSiliguri_400Regular, HindSiliguri_500Medium, NotoSansDevanagari_400Regular, NotoSansDevanagari_500Medium,
    NotoSansJP_400Regular, NotoSansJP_500Medium,
  });
  if (!loaded) return null;
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }} />
    </>
  );
}
