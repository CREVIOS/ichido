import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Image, StyleSheet, Text, View } from "react-native";
import { Mark } from "@/components/ui";
import { font } from "@/theme";
import { ART } from "@content/catalogue";

// Opening splash: Tōhaku's pines in ink on white, the mark, then it dissolves into the app.
export function ArtSplash() {
  const [gone, setGone] = useState(false);
  const art = useRef(new Animated.Value(0)).current;
  const mark = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      const d = reduce ? 0 : 1;
      Animated.sequence([
        Animated.parallel([
          Animated.timing(art, { toValue: 1, duration: 1400 * d, useNativeDriver: true }),
          Animated.timing(mark, { toValue: 1, duration: 900 * d, delay: 600 * d, useNativeDriver: true }),
        ]),
        Animated.delay(reduce ? 500 : 700),
        Animated.timing(out, { toValue: 0, duration: 600 * d, useNativeDriver: true }),
      ]).start(() => setGone(true));
    });
    return () => { cancelled = true; };
  }, [art, mark, out]);
  if (gone) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#FFFFFF", opacity: out, zIndex: 100 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: art, transform: [{ scale: art.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }] }]}>
        <Image source={require("@/assets/images/splash-art.png")} resizeMode="cover" style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={styles.center}>
        <Animated.View style={{ alignItems: "center", gap: 10, opacity: mark, transform: [{ translateY: mark.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }}>
          <View style={styles.halo} />
          <Mark size={44} />
          <Text style={styles.word}>Ichido</Text>
        </Animated.View>
      </View>
      <Animated.Text style={[styles.credit, { opacity: mark }]}>{ART.credit}</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", width: 220, height: 160, borderRadius: 110, backgroundColor: "rgba(255,255,255,0.85)" },
  word: { fontFamily: font.inter[400], fontSize: 28, letterSpacing: -1.1, color: "rgba(0,0,0,0.85)" },
  credit: { position: "absolute", bottom: 36, alignSelf: "center", fontFamily: font.ja[400], fontSize: 11, color: "rgba(0,0,0,0.45)" },
});
