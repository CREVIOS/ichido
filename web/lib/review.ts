"use client";
import { useCallback, useState } from "react";
import { sb } from "./supabase";
import { useLive } from "./live";
import type { Lang, Status } from "@/content/catalogue";

export type ReviewKind = "suggestion" | "record" | "translation" | "handoff";
export type ReviewItem = {
  kind: ReviewKind; incident: string; ref: string; at: string;
  station: string; station_label: string | null; fault: string; lang: Lang | null; status: Status;
  data: Record<string, unknown>;
};
export const REVIEW_KINDS: ReviewKind[] = ["suggestion", "record", "translation", "handoff"];
export const itemKey = (i: Pick<ReviewItem, "kind" | "incident" | "ref">) => `${i.kind}:${i.incident}:${i.ref}`;

// The signed-in operator's unreviewed items (public.review_queue), live. Every source of an item writes a case_event
// (bot_prepared, suggested, bot_closed, teachback, handoff, handoff_viewed …) or a desk row, and a decision writes review_state.
export function useReviewQueue(enabled = true) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async (signal: AbortSignal) => {
    const { data, error } = await sb().rpc("review_queue").abortSignal(signal);
    if (signal.aborted) return;
    setFailed(Boolean(error));
    if (!error) setItems(data as ReviewItem[]);
  }, []);
  useLive(["review_state", "case_event", "desk"], load, enabled);
  return { items, failed };
}
