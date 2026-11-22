"use client";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, FileCheck2, Languages, Link2, Sparkles, X, type LucideIcon } from "lucide-react";
import { PaneButton, TitleBar } from "@/components/pane";
import { Chip } from "@/components/kit";
import { cn } from "@/lib/utils";
import { CASES, DESK, HANDOFF, LANG_NAME, REVIEW, STAFF_JA, isFault, replyOf, type L10n, type Lang } from "@/content/catalogue";
import type { ReviewItem, ReviewKind } from "@/lib/review";
import type { Suggestion } from "../operator/types";

export type Decide = (item: ReviewItem, decision: string, extra?: Record<string, unknown>) => Promise<{ path?: string } | null>;
export const KIND_ICON: Record<ReviewKind, LucideIcon> = { suggestion: Sparkles, record: FileCheck2, translation: Languages, handoff: Link2 };

type Rec = { summary: string; claim_s: number | null; first_reply_s: number | null; guard_arrival_s: number | null; total_s: number; finished_at: string };
type Mt = { source: string; text: string; ja: string };
type Link = { recipient: string; created_at: string; expires_at: string; views: number };
const sugg = (i: ReviewItem) => i.data.suggestion as Suggestion;
const langName = (l: Lang | null) => (l ? CASES.languages[l] : "—");
const fault = (f: string) => (isFault(f) ? STAFF_JA.fault[f] : DESK.unknownFault);

export function subtitle(i: ReviewItem): string {
  if (i.kind === "suggestion") {
    const s = sugg(i);
    return REVIEW.suggestion.sub(replyOf(s.intent)?.code ?? "—", s.dispatch ? s.guard?.name ?? null : null);
  }
  if (i.kind === "record") return REVIEW.record.sub(REVIEW.secs((i.data as Rec).total_s));
  if (i.kind === "translation") return `${REVIEW.translation.source[(i.data as Mt).source]}・${langName(i.lang)}`;
  const h = i.data as Link;
  return REVIEW.handoff.sub(HANDOFF.recipient[h.recipient] ?? h.recipient, h.views === 0);
}

type Action = { label: string; run: () => void; disabled?: boolean };
type View = { tag: string; summary: ReactNode; more?: ReactNode; rows: [string, ReactNode][]; body?: ReactNode; foot?: ReactNode; primary: Action; secondary?: Action };

// The selected item, laid out as a draft: header (case · fault, ↑/↓, dismiss, primary), the summary card, then the details with the action.
export function Detail({ item, pos, busy, move, decide, dismiss, primaryRef }: {
  item: ReviewItem; pos: { at: number; of: number }; busy: boolean; move: (by: number) => void; decide: Decide; dismiss: () => void; primaryRef: RefObject<(() => void) | null>;
}) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const v = view(item, decide, note, setNote);
  const Icon = KIND_ICON[item.kind];
  useEffect(() => {
    primaryRef.current = v.primary.disabled ? null : v.primary.run;
    return () => { primaryRef.current = null; };
  });

  return (
    <>
      <TitleBar icon={Icon} title={`${item.station_label ?? item.station} · ${fault(item.fault)}`}>
        <span className="ml-auto flex items-center gap-1">
          <PaneButton aria-label={REVIEW.prev} title={REVIEW.prev} disabled={pos.at <= 0} onClick={() => move(-1)}><ChevronUp /></PaneButton>
          <PaneButton aria-label={REVIEW.next} title={REVIEW.next} disabled={pos.at >= pos.of - 1} onClick={() => move(1)}><ChevronDown /></PaneButton>
          <PaneButton className="ml-1" title={REVIEW.dismissKey} disabled={busy} onClick={dismiss}><X />{REVIEW.dismiss}</PaneButton>
          <PaneButton title={REVIEW.keys} disabled={busy || v.primary.disabled} onClick={v.primary.run}><Check />{v.primary.label}</PaneButton>
        </span>
      </TitleBar>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 lg:px-10">
        <div className="mx-auto mt-5 w-full max-w-[720px] pb-10">
          <article className="flex flex-col rounded-lg border-[0.5px] border-black/12 bg-black/2 px-3 pt-2.5 pb-2">
            <div className="flex min-w-0 items-center gap-2">
              <Icon className="size-4 shrink-0 stroke-[1.5] text-foreground" aria-hidden />
              <span className="truncate text-[13px] font-medium text-foreground">{REVIEW.groups[item.kind]}</span>
              <span className="flex h-4 shrink-0 items-center rounded-[4px] border-[0.5px] border-black/12 px-1 text-[10px] leading-none text-foreground">{v.tag}</span>
            </div>
            <div className="mt-2 text-[13px] leading-normal text-foreground">{v.summary}</div>
            {v.more && open && <div className="mt-3 flex flex-col gap-3 border-t-[0.5px] border-black/12 pt-3 text-[12px] leading-5">{v.more}</div>}
            {v.more ? (
              <div className="mt-1 flex h-5 items-center justify-center">
                <button type="button" aria-expanded={open} aria-label={open ? REVIEW.less : REVIEW.more} title={open ? REVIEW.less : REVIEW.more} onClick={() => setOpen(!open)}
                  className="grid size-[22px] place-items-center rounded-[5px] text-foreground hover:bg-black/4">
                  <ChevronDown className={cn("size-4 stroke-[1.5] transition-transform", open && "rotate-180")} />
                </button>
              </div>
            ) : <div className="h-1" />}
          </article>
          <section className="mt-3 flex min-h-64 w-full flex-col rounded-lg border-[0.5px] border-black/12 bg-card">
            <dl className="px-3 pt-1 text-[12px]">
              {v.rows.map(([k, val]) => (
                <div key={k} className="grid min-h-7 grid-cols-[7.5rem_minmax(0,1fr)] items-center">
                  <dt className="text-muted-foreground">{k}</dt><dd className="truncate text-foreground">{val}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-1 flex-col gap-2 px-3 pt-2 text-[13px] leading-normal text-foreground">{v.body}</div>
            <div className="mt-4 flex min-h-10 shrink-0 flex-wrap items-center gap-1.5 px-3 py-1.5">
              <span className="min-w-0 flex-1 text-[11px] leading-4 text-muted-foreground">{v.foot}</span>
              {v.secondary && <PaneButton className="h-6 px-2 text-[12px]" disabled={busy || v.secondary.disabled} onClick={v.secondary.run}>{v.secondary.label}</PaneButton>}
              <button type="button" disabled={busy || v.primary.disabled} onClick={v.primary.run}
                className="inline-flex h-6 items-center gap-1.5 rounded-[6px] bg-brand-strong px-2 text-[12px] text-white transition-opacity hover:opacity-90 disabled:opacity-40">
                <Check className="size-3.5 stroke-[1.75]" />{v.primary.label}
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

const List = ({ title, items }: { title: string; items: string[] }) => items.length ? (
  <div className="flex flex-col gap-1"><span className="text-muted-foreground">{title}</span>
    <ul className="flex flex-col gap-1 text-foreground">{items.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/40" />{x}</li>)}</ul>
  </div>
) : null;

function view(item: ReviewItem, decide: Decide, note: string, setNote: (s: string) => void): View {
  const ok = (msg: string) => (r: unknown) => { if (r) toast.success(msg); };
  if (item.kind === "suggestion") {
    const s = sugg(item);
    const r = replyOf(s.intent);
    const guard = s.dispatch ? s.guard : null;
    const text = r?.text((item.data.slots ?? {}) as { branch?: L10n; hours?: L10n });
    const lang = item.lang ?? "ja";
    const S = REVIEW.suggestion;
    return {
      tag: S.tag,
      summary: s.reasons.length ? s.reasons.join(" ") : r ? r.title : S.noIntent,
      more: (s.reasons.length > 0 || s.risks.length > 0) && <><List title={S.reasons} items={s.reasons} /><List title={S.risks} items={s.risks} /></>,
      rows: [
        [S.rows.to, S.to(LANG_NAME[lang])],
        [S.rows.reply, r ? <><span className="mono mr-2 text-muted-foreground">{r.code}</span>{r.title}</> : S.noIntent],
        [S.rows.guard, guard ? guard.name : S.noGuard],
        [S.rows.by, <span key="by" className="num">{DESK.ai.by(s.model)}・{DESK.ai.total(s.ms)}</span>],
      ],
      body: text && <><p>{text.ja}</p>{lang !== "ja" && <p lang={lang} className="text-soft">{text[lang]}</p>}</>,
      foot: S.note,
      primary: { label: guard ? S.acceptDispatch(guard.name) : S.accept, disabled: !r, run: () => decide(item, "accepted").then(ok(S.toast)) },
    };
  }
  if (item.kind === "record") {
    const d = item.data as Rec;
    const R = REVIEW.record;
    return {
      tag: R.tag,
      summary: d.summary,
      rows: [
        [R.rows.closed, <span key="c" className="num">{REVIEW.at(d.finished_at)}</span>],
        [R.rows.claim, REVIEW.secs(d.claim_s)],
        [R.rows.reply, REVIEW.secs(d.first_reply_s)],
        [R.rows.guard, REVIEW.secs(d.guard_arrival_s)],
        [R.rows.total, REVIEW.secs(d.total_s)],
      ],
      body: (
        <label className="flex flex-col gap-1.5 pb-1">
          <span className="text-[12px] text-muted-foreground">{R.note}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={4} placeholder={R.notePlaceholder}
            className="w-full resize-none rounded-md border-[0.5px] border-black/12 bg-transparent px-2.5 py-2 text-[13px] leading-normal outline-none placeholder:text-faint focus:border-black/25" />
          <span className="num text-[11px] text-muted-foreground">{R.noteHint}・{note.length}/500</span>
        </label>
      ),
      foot: <Chip>{DESK.recordDraft}</Chip>,
      primary: { label: R.approve, run: () => decide(item, "approved", note.trim() ? { note: note.trim() } : {}).then(ok(R.toast)) },
    };
  }
  if (item.kind === "translation") {
    const d = item.data as Mt;
    const T = REVIEW.translation;
    return {
      tag: T.tag,
      summary: d.ja,
      rows: [[T.rows.source, T.source[d.source]], [T.rows.lang, langName(item.lang)]],
      body: <>
        <span className="text-[12px] text-muted-foreground">{T.original}</span>
        <p lang={item.lang ?? undefined} className="text-[16px] leading-7">{d.text}</p>
        <span className="flex items-start gap-2 text-[14px]"><Chip className="shrink-0">{T.mt}</Chip>{d.ja}</span>
      </>,
      foot: T.hint,
      secondary: { label: T.flag, run: () => decide(item, "flagged").then(ok(T.flagged)) },
      primary: { label: T.confirm, run: () => decide(item, "confirmed").then(ok(T.toast)) },
    };
  }
  const h = item.data as Link;
  const H = REVIEW.handoff;
  const to = HANDOFF.recipient[h.recipient] ?? h.recipient;
  return {
    tag: H.tag,
    summary: H.summary(to, h.views === 0, REVIEW.at(h.expires_at)),
    rows: [
      [H.rows.to, to],
      [H.rows.issued, <span key="i" className="num">{REVIEW.at(h.created_at)}</span>],
      [H.rows.expires, <span key="e" className="num">{REVIEW.at(h.expires_at)}</span>],
      [H.rows.views, <span key="v" className="num">{H.views(h.views)}</span>],
    ],
    body: <p className="text-[13px] text-soft">{HANDOFF.lead}</p>,
    secondary: { label: H.revoke, run: () => decide(item, "revoked").then(ok(H.revoked)) },
    primary: {
      label: H.reissue,
      run: async () => {
        const r = await decide(item, "reissued");
        if (!r?.path) return;
        const url = `${location.origin}${r.path}`;
        await navigator.clipboard.writeText(url).catch(() => undefined);
        toast.success(H.copied, { description: url });
      },
    },
  };
}
