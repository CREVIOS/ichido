import { useCallback, useState } from "react";
import { View } from "react-native";
import { DESK, FRONT_DESK, LANG_NAME, STAFF, staffError } from "@content/catalogue";
import { monitorEvent, monitorText, sameMonitorGroup, type MonitorTurn } from "@content/chat";
import { useLive } from "@/lib/live";
import { cmd } from "@/lib/supabase";
import { ChatBubble } from "./ChatBubble";
import { Notice, T } from "./ui";

export function OperatorThread({incident}: {incident:string}) {
  const [turns,setTurns] = useState<MonitorTurn[]>([]);
  const [error,setError] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await cmd<{turns:MonitorTurn[]}>("frontline_monitor",{incident});
      setTurns(r.turns); setError("");
    } catch (e) { setTurns([]); setError(staffError((e as Error).message)); }
  },[incident]);
  useLive(["frontline_turn","frontline_translation","desk"],load);
  return <View>
    <T v="h2">{FRONT_DESK.monitor}</T>
    {!!error && <Notice tone="warn">{error}</Notice>}
    {turns.map((t,i) => {
      const from = t.speaker === "caller" ? "caller" : t.speaker === "ai" ? "ai" : "operator";
      const original = monitorText(t);
      const translation = t.locale === "ja" ? null : monitorText(t,"ja");
      const timeJump = i > 0 && Date.parse(t.at)-Date.parse(turns[i-1].at) >= 300000;
      return <View key={t.seq}>
        {timeJump && <T v="small" style={{textAlign:"center"}}>{new Date(t.at).toLocaleString("ja")}</T>}
        {monitorEvent(t.wording) ? <T v="label" style={{textAlign:"center",marginVertical:8}}>{t.wording === "start" ? FRONT_DESK.consent : original}</T>
          : <ChatBubble from={from} text={original || ""} lang={t.locale} first={!sameMonitorGroup(t,turns[i-1])} last={!sameMonitorGroup(t,turns[i+1])}
            label={from === "caller" ? FRONT_DESK.submitted : from === "ai" ? FRONT_DESK.aiSpeaker : STAFF.roleName.operator}/>}
        {translation && <T v="label" accessibilityLanguage="ja">{t.words ? FRONT_DESK.translation : LANG_NAME.ja} · {translation}</T>}
        {t.words && !translation && t.locale !== "ja" && <T v="small">{DESK.teach.noMt(LANG_NAME[t.locale])}</T>}
        {from === "ai" && <T v="small">{FRONT_DESK.delivery[t.delivery]}</T>}
      </View>;
    })}
  </View>;
}
