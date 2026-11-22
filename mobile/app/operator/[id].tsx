import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, type Me } from "@/components/StaffGate";
import { Brand, Button, Card, Fact, Inset, Menu, Notice, Pill, Row, Screen, T, Tag } from "@/components/ui";
import { SuggestCard, type Run } from "@/components/SuggestCard";
import { type Desk, errorJa, faultJa, hhmm } from "@/lib/staff";
import {
  FACT_STAFF, REPLIES, LANG_NAME, FIELD_STATE, REMOTE_RELEASE, ACTOR, MANUAL_VERSION, MOBILE, STATUS,
  eventText, summaryDraft, pick, replyOf,
  type Lang, type FieldState, type L10n, STAFF_JA,
} from "@content/catalogue";

const O = MOBILE.operator;
type CallerCard = {
  field_state: FieldState; eta: string | null; choice: string | null; reply_id: string | null;
  teachback: string | null; teachback_ja: string | null; teachback_reply: string | null; needs_human: boolean;
};
type Event = { id: number; actor: string; actor_name: string | null; kind: string; data: Record<string, string>; at: string };
type Reply = { id: string; intent: string; slots: { branch?: L10n; hours?: L10n }; sent_at: string };
type Job = { assignee: string; state: FieldState; eta: string | null };
type Guard = { uid: string; display_name: string };

export default function CaseScreen() {
  return <StaffGate allow={["operator"]} title={O.title}>{(me) => <CaseView me={me} />}</StaffGate>;
}

function CaseView({ me }: { me: Me }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [d, setD] = useState<Desk | null>(null);
  const [stationLabel, setStationLabel] = useState("");
  const [card, setCard] = useState<CallerCard | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [error, setError] = useState("");

  // Staff never read the caller's draft; only what the caller confirmed reaches the desk.
  const load = useCallback(async () => {
    const db = sb();
    const [k, c, e, r, j] = await Promise.all([
      db.from("desk").select("*").eq("id", id).maybeSingle(),
      db.from("caller_card").select("field_state, eta, choice, reply_id, teachback, teachback_ja, teachback_reply, needs_human").eq("id", id).maybeSingle(),
      db.from("case_event").select("*").eq("incident", id).order("id"),
      db.from("reply").select("id, intent, slots, sent_at").eq("incident", id).order("sent_at"),
      db.from("field_job").select("assignee, state, eta").eq("incident", id).maybeSingle(),
    ]);
    const desk = k.data as Desk | null;
    setD(desk); setCard(c.data as CallerCard); setEvents((e.data ?? []) as Event[]); setReplies((r.data ?? []) as Reply[]); setJob(j.data as Job);
    if (desk) {
      const { data: s } = await db.from("station").select("label").eq("id", desk.station).maybeSingle();
      setStationLabel((s?.label as L10n | undefined)?.ja ?? desk.station);
    }
  }, [id]);
  useLive(["desk", "caller_card", "case_event", "reply", "field_job"], load);
  useEffect(() => { cmd<{ field: Guard[] }>("staff_list").then((r) => setGuards(r.field)).catch(() => setGuards([])); }, []);

  const run: Run = (name, body = {}) =>
    cmd(name, body).then((r) => { setError(""); load(); return r; }).catch((e: Error) => { setError(errorJa(e.message)); load(); });

  if (!d) return <Screen back eyebrow={<Brand />} onRefresh={load}>{null}</Screen>;

  const mine = d.operator_id === me.uid;
  const closed = Boolean(d.finished_at);
  const lang: Lang = d.lang ?? "bn";
  const lastPaired = events.findLastIndex((x) => x.kind === "paired");
  const paired = lastPaired >= 0 && !events.some((e, i) => e.kind === "caller_reset" && i > lastPaired);

  return (
    <Screen
      back
      eyebrow={<T v="label" mono>{d.station}</T>}
      title={stationLabel}
      onRefresh={load}
      right={!closed && mine ? (
        <Menu label={O.actions} closeLabel={MOBILE.staff.close} items={[
          ...(!d.remote_release ? [
            { label: O.releaseFailed, onPress: () => run("remote_release", { incident: d.id, result: "failed" }) },
            { label: O.releaseOk, onPress: () => run("remote_release", { incident: d.id, result: "released" }) },
          ] : []),
          { label: O.resetCaller, onPress: () => run("reset_caller", { incident: d.id }) },
          { label: O.abandon, onPress: () => run("abandon", { incident: d.id }) },
        ]} />
      ) : undefined}
    >
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        <Pill tone={d.abandoned ? "alert" : d.status}>{d.abandoned ? O.abandonedChip : STAFF_JA.status[d.status]}</Pill>
        {d.lang && <Pill>{LANG_NAME[d.lang]}</Pill>}
      </View>
      {error ? <Notice tone="alert">{error}</Notice> : null}

      <Machine d={d} />
      {closed ? (
        <Card title={O.finished}><T v="body">{d.abandoned ? O.finishedAbandoned : O.finishedDone}</T></Card>
      ) : !d.operator_id ? (
        <Card title={O.unclaimed}><Button label={O.claim} onPress={() => run("claim", { incident: d.id })} block /></Card>
      ) : !mine ? (
        <Card title={O.otherOperator}><T v="body">{O.otherOperatorBody}</T></Card>
      ) : null}

      <CallerWords d={d} card={card} lang={lang} paired={paired} canJudge={!closed && mine} run={run} />

      {!closed && mine && (
        <>
          {!paired && <PairCard incident={d.id} />}
          <SuggestCard d={d} run={run} />
          <ReplyCard d={d} lang={lang} replies={replies} run={run} />
          <DispatchCard d={d} job={job} guards={guards} card={card} lang={lang} run={run} />
        </>
      )}

      <Timeline events={events} />
      {closed && d.status === "guided" && (
        <Card title={O.record} action={<Tag value={O.recordDraft} />}>
          <T v="body" tone="ink">{summaryDraft({ card_back: d.card_back, cash_received: d.cash_received, remote_release: d.remote_release, dispatched: Boolean(job), choice: card?.choice ?? null })}</T>
        </Card>
      )}
    </Screen>
  );
}

function Machine({ d }: { d: Desk }) {
  return (
    <Card>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 14, columnGap: 20 }}>
        <Fact label={O.facts.atm} value={<T v="body" mono tone="ink">{d.station}</T>} />
        <Fact label={O.facts.fault} value={faultJa(d.fault)} tone="alert" />
        <Fact label={O.facts.release} value={d.remote_release ? REMOTE_RELEASE[d.remote_release] : O.facts.notTried} />
        <Fact label={O.facts.source} value={d.source === "device" ? O.facts.device : O.facts.simulator} />
        <Fact label={O.facts.received} value={<T v="body" mono tone="ink">{hhmm(d.created_at)}</T>} />
      </View>
    </Card>
  );
}

function Timeline({ events }: { events: Event[] }) {
  return (
    <Card title={O.timeline}>
      {events.map((e) => (
        <View key={e.id} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <T v="small" mono style={{ width: 40 }}>{hhmm(e.at)}</T>
          <T v="small" weight={500} tone="body" style={{ width: 56 }}>{e.actor_name ?? ACTOR[e.actor]}</T>
          <T v="label" tone="ink" style={{ flex: 1 }}>{eventText(e.kind, e.data)}</T>
        </View>
      ))}
    </Card>
  );
}

function CallerWords({ d, card, lang, paired, canJudge, run }: { d: Desk; card: CallerCard | null; lang: Lang; paired: boolean; canJudge: boolean; run: Run }) {
  return (
    <Card title={O.words} action={card?.needs_human ? <Pill tone="alert">{O.wantsHuman}</Pill> : undefined}>
      {d.confirmed_rev == null ? (
        <T v="label">{paired ? O.confirming : O.notPaired}{d.clarifying ? `　${O.clarifying}` : ""}</T>
      ) : (
        <>
          <Inset>
            <T v="small">{O.original(LANG_NAME[lang])}</T>
            <T v="h2" weight={400}>{d.caller_words ?? O.byChoice}</T>
          </Inset>
          <Inset>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T v="small">{O.confirmed}</T><T v="small" mono>{O.rev(d.confirmed_rev)}</T></View>
            <T v="body" tone="ink">{FACT_STAFF.card_back[d.card_back]}</T>
            <T v="body" tone="ink">{FACT_STAFF.cash_received[d.cash_received]}</T>
          </Inset>
        </>
      )}
      {card?.choice && <Tag label={O.choice} value={card.choice === "wait" ? O.choiceWait : O.choiceLeave} />}
      {card?.teachback && <TeachBack card={card} lang={lang} canJudge={canJudge} onJudge={(result) => run("outcome", { incident: d.id, reply: card.teachback_reply, result })} />}
    </Card>
  );
}

// The operator cannot read Bengali, so the judgement rests on a labelled machine translation, or on a bilingual colleague.
function TeachBack({ card, lang, canJudge, onJudge }: { card: CallerCard; lang: Lang; canJudge: boolean; onJudge: (r: "understood" | "clarify") => void }) {
  const current = card.teachback_reply === card.reply_id;
  return (
    <Inset style={{ gap: 8 }}>
      <T v="small">{O.teachBack}</T>
      <T v="h2" weight={400}>{card.teachback}</T>
      {lang !== "ja" && (card.teachback_ja ? (
        <View style={{ gap: 6 }}><Tag value={O.machineTranslation} /><T v="body" tone="ink">{card.teachback_ja}</T></View>
      ) : (
        <T v="label" tone="alert">{O.noTranslation(LANG_NAME[lang])}</T>
      ))}
      {!current && <T v="small">{O.olderTeachBack}</T>}
      {canJudge && current && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label={O.understood} onPress={() => onJudge("understood")} style={{ flex: 1 }} />
          <Button kind="secondary" label={O.clarify} onPress={() => onJudge("clarify")} style={{ flex: 1 }} />
        </View>
      )}
    </Inset>
  );
}

function PairCard({ incident }: { incident: string }) {
  const [code, setCode] = useState<{ value: string; until: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!code) return;
    const t = setTimeout(() => setCode(null), code.until - Date.now());
    return () => clearTimeout(t);
  }, [code]);
  const issue = () => cmd<{ code: string; expires_in: number }>("issue_code", { incident })
    .then((r) => { setError(""); setCode({ value: r.code, until: Date.now() + r.expires_in * 1000 }); })
    .catch((e: Error) => setError(errorJa(e.message)));
  return (
    <Card title={O.pairTitle} action={<Tag value={O.pairValid} />}>
      <T v="label">{O.pairBody}</T>
      {code && <T v="code" selectable accessibilityLabel={code.value.split("").join(" ")}>{code.value}</T>}
      {error ? <Notice tone="alert">{error}</Notice> : null}
      <Button kind={code ? "secondary" : "primary"} label={code ? O.pairReissue : O.pairIssue} onPress={issue} block />
    </Card>
  );
}

function ReplyCard({ d, lang, replies, run }: { d: Desk; lang: Lang; replies: Reply[]; run: Run }) {
  const [intent, setIntent] = useState(Object.keys(REPLIES)[0]);
  const r = replyOf(intent) ?? REPLIES[Object.keys(REPLIES)[0]];
  const preview = r.text(replies.at(-1)?.slots ?? {});
  // Mirrors the server rule: "card is still inside" only when the caller confirmed it and no release succeeded.
  const blocked = d.confirmed_rev == null ? O.waitConfirm
    : r.needsHeld && (d.card_back !== "no" || d.remote_release === "released") ? O.heldMismatch : "";
  return (
    <Card title={O.replies} action={<T v="small" mono>{MANUAL_VERSION}</T>}>
      <View style={{ marginHorizontal: -8 }}>
        {Object.entries(REPLIES).map(([k, x]) => (
          <Row key={k} label={x.title} meta={x.code} selected={k === intent} onPress={() => setIntent(k)} />
        ))}
      </View>
      <Inset>
        {replies.length || !r.offersChoice ? (
          <><T v="label" tone="ink">{preview.ja}</T><T v="label">{preview[lang]}</T></>
        ) : (
          <T v="label">{O.slotsHint(LANG_NAME[lang])}</T>
        )}
      </Inset>
      <Button label={O.sendReply} disabled={Boolean(blocked)} onPress={() => run("send", { incident: d.id, intent })} block />
      {(blocked || replies.length > 0) && <T v="small">{blocked || O.sentCount(replies.length)}</T>}
    </Card>
  );
}

function DispatchCard({ d, job, guards, card, lang, run }: { d: Desk; job: Job | null; guards: Guard[]; card: CallerCard | null; lang: Lang; run: Run }) {
  const others = guards.filter((g) => g.uid !== job?.assignee);
  return (
    <Card title={O.dispatch}>
      {job ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T v="body" tone="ink">{guards.find((g) => g.uid === job.assignee)?.display_name ?? O.guard}</T>
            <Pill tone="field">{STAFF_JA.field[job.state]}</Pill>
          </View>
          <T v="label">{job.eta ? O.eta(job.eta) : O.etaUnknown}</T>
        </View>
      ) : (
        <T v="label">{O.dispatchBody}</T>
      )}
      <View style={{ gap: 8 }}>
        {others.map((g) => <Button key={g.uid} kind="secondary" label={O.assign(g.display_name, Boolean(job))} onPress={() => run("assign", { incident: d.id, assignee: g.uid })} block />)}
      </View>
      {card && card.field_state !== "none" && <T v="small">{O.callerScreen(pick(FIELD_STATE[card.field_state], lang))}</T>}
    </Card>
  );
}
