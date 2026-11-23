import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import { cmd } from "@/lib/supabase";
import { errorJa, type Desk } from "@/lib/staff";
import { Button, Card, Icon, Notice, T, Tag } from "@/components/ui";
import { chart, color, radius, space } from "@/theme";
import { DESK, replyOf } from "@content/catalogue";

type Step = { tool: string; ms: number };
type Suggestion = { intent: string | null; dispatch: boolean; guard: { uid: string; name: string } | null; reasons: string[]; risks: string[]; model: string; steps: Step[]; ms: number };
type State = { status: "idle" | "loading" | "off" | "failed" } | { status: "ready"; s: Suggestion };
export type Run = (name: string, body?: Record<string, unknown>) => Promise<unknown>;

// Gemini's recommendation for this case (web/app/operator/suggest.tsx), refreshed when the caller confirms new facts.
// The operator adopts it (send, then assign) or ignores it.
export function SuggestCard({ d, run }: { d: Desk; run: Run }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [note, setNote] = useState("");
  const ask = useCallback(() => {
    setState({ status: "loading" });
    cmd<{ suggestion: Suggestion | null }>("suggest", { incident: d.id })
      .then((r) => setState(r.suggestion ? { status: "ready", s: r.suggestion } : { status: "off" }))
      .catch((e: Error) => { setState({ status: "failed" }); if (e.message !== "server") setNote(errorJa(e.message)); });
  }, [d.id]);
  // Ask once the caller has confirmed, and again whenever they confirm a new revision.
  useEffect(() => { if (d.confirmed_rev != null) queueMicrotask(ask); }, [d.confirmed_rev, ask]);

  const adopt = async (s: Suggestion) => {
    if (!s.intent || !(await run("send", { incident: d.id, intent: s.intent }))) return;
    const assigned = s.dispatch && s.guard && await run("assign", { incident: d.id, assignee: s.guard.uid });
    if (s.dispatch && s.guard && !assigned) return setNote(DESK.reply.sendOnly);
    setNote(assigned && s.guard ? DESK.reply.bundleToast(s.guard.name) : DESK.reply.toast);
  };

  return (
    <Card
      title={<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon icon={Sparkles} size={14} tone="muted" /><T v="label" tone="muted">{DESK.ai.title}</T></View>}
      action={state.status === "ready" ? <Tag value={DESK.ai.by(state.s.model)} /> : undefined}>
      {state.status === "off" && <Notice>{DESK.ai.off}</Notice>}
      {state.status === "failed" && <Notice tone="warn">{DESK.ai.failed}</Notice>}
      {state.status === "loading" && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 64 }}>
          <ActivityIndicator size="small" color={color.muted} /><T v="label">{DESK.ai.thinking}</T>
        </View>
      )}
      {state.status === "ready" && <Body s={state.s} onAdopt={() => adopt(state.s)} />}
      {note ? <Notice tone="info">{note}</Notice> : null}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
        <T v="small" style={{ flex: 1 }}>{DESK.ai.note}</T>
        {state.status !== "loading" && <Button kind="ghost" label={state.status === "idle" ? DESK.ai.get : DESK.ai.again} onPress={ask} />}
      </View>
    </Card>
  );
}

function Body({ s, onAdopt }: { s: Suggestion; onAdopt: () => void }) {
  const r = s.intent ? replyOf(s.intent) : undefined;
  return (
    <View style={{ borderWidth: 1, borderColor: color.focus, borderRadius: radius.card - 2, padding: space.md, gap: space.md }}>
      {r ? (
        <View style={{ flexDirection: "row", gap: 10 }}><T v="row" mono tone="muted">{r.code}</T><T v="row" style={{ flex: 1 }}>{r.title}</T></View>
      ) : <T v="row">{DESK.ai.noIntent}</T>}
      {s.dispatch && s.guard && <T v="label" tone="ink">{DESK.ai.dispatch(s.guard.name)}</T>}
      <List title={DESK.ai.reasons} items={s.reasons} />
      <List title={DESK.ai.risks} items={s.risks} />
      <Trace steps={s.steps} ms={s.ms} />
      {r && <Button label={s.dispatch && s.guard ? DESK.ai.adoptDispatch(s.guard.name) : DESK.ai.adopt} onPress={onAdopt} block />}
    </View>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <View style={{ gap: 4 }}>
      <T v="small">{title}</T>
      {items.map((x) => (
        <View key={x} style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color.faint, marginTop: 8 }} />
          <T v="label" tone="ink" style={{ flex: 1 }}>{x}</T>
        </View>
      ))}
    </View>
  );
}

// What the model looked at, in order, with each step's time: a small waterfall.
function Trace({ steps, ms }: { steps: Step[]; ms: number }) {
  if (!steps.length) return null;
  const max = Math.max(1, ...steps.map((x) => x.ms));
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T v="small">{DESK.ai.trace}</T><T v="small" mono>{DESK.ai.total(ms)}</T></View>
      {steps.map((x, i) => (
        <View key={`${x.tool}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T v="tiny" numberOfLines={1} style={{ width: 96 }}>{DESK.ai.tools[x.tool] ?? x.tool}</T>
          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: color.press, overflow: "hidden" }}>
            <View style={{ height: 6, borderRadius: 3, width: `${Math.max(4, (x.ms / max) * 100)}%`, backgroundColor: x.tool === "model" ? chart.blue : chart.green }} />
          </View>
          <T v="tiny" mono style={{ width: 48, textAlign: "right" }}>{x.ms}ms</T>
        </View>
      ))}
    </View>
  );
}
