import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { ChartColumn, MonitorDot, ShieldCheck, type LucideIcon } from "lucide-react-native";
import { cmd, signOut } from "@/lib/supabase";
import { Brand, Button, Card, Input, LangPicker, Notice, Row, Screen, Section, T } from "@/components/ui";
import { HOME, MOBILE, STAFF, type Lang } from "@content/catalogue";

const ICON: Record<string, LucideIcon> = { "/operator": MonitorDot, "/field": ShieldCheck, "/insights": ChartColumn };
const STATION_ROLE = HOME.screens.items.find((r) => r.href.startsWith("/s/"));
const STAFF_ROLES = HOME.screens.items.filter((r) => r !== STATION_ROLE);

// Accepts a bare station id or any Help Point link (https://…/s/TABLE-A, ichido://s/TABLE-A).
const stationFrom = (s: string) => {
  const m = s.trim().match(/\/s\/([^/?#\s]+)/);
  return decodeURIComponent(m ? m[1] : s.trim());
};

export default function Entry() {
  const [lang, setLang] = useState<Lang>("bn");
  const [station, setStation] = useState("");
  const [staffName, setStaffName] = useState<string | null>(null);

  // A phone already paired goes straight to its case; a signed-in staff member is shown as such.
  useFocusEffect(useCallback(() => {
    cmd<{ incident: string | null; staff: boolean }>("mine").then(async (m) => {
      if (m.incident) return router.replace("/caller");
      setStaffName(m.staff ? (await cmd<{ name?: string }>("me")).name ?? "" : null);
    }).catch(() => setStaffName(null));
  }, []));

  const go = () => router.push({ pathname: "/s/[station]", params: { station: stationFrom(station), lang } });

  return (
    <Screen eyebrow={<Brand />} title={HOME.title.join(" ")}>
      <T v="body">{HOME.lead}</T>

      <Section label={`${MOBILE.entry.caller.ja} · ${MOBILE.entry.caller.en}`}>
        <Card>
          <View style={{ gap: 2 }}>
            <T v="h2">{STATION_ROLE?.title}</T>
            <T v="small">{STATION_ROLE?.sub}</T>
          </View>
          <LangPicker lang={lang} onChange={setLang} />
          <Input label={MOBILE.station.label[lang]} value={station} onChangeText={setStation} placeholder="TABLE-A" mono
            autoCapitalize="characters" autoCorrect={false} onSubmitEditing={() => station.trim() && go()} />
          <T v="small">{MOBILE.station.hint[lang]}</T>
          <Button label={MOBILE.station.open[lang]} onPress={go} disabled={!stationFrom(station)} block />
        </Card>
      </Section>

      <Section label={`${MOBILE.entry.staff.ja} · ${MOBILE.entry.staff.en}`}>
        {staffName != null && (
          <Notice>{MOBILE.entry.signedIn(staffName)}</Notice>
        )}
        <Card style={{ padding: 4, gap: 0 }}>
          {STAFF_ROLES.map((r) => (
            <Row key={r.href} icon={ICON[r.href]} label={r.title} sub={r.sub} chevron onPress={() => router.push(r.href as Href)} />
          ))}
        </Card>
        {staffName != null && <Button kind="ghost" label={STAFF.signOut} onPress={() => signOut().then(() => setStaffName(null))} />}
      </Section>

    </Screen>
  );
}
