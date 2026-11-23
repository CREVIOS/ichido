-- AI assistance (web/lib/triage.ts, web/lib/summary.ts). Idempotent: safe to re-apply on a shared local database.

-- Pack triage: what the model read in the caller's words, as catalogue codes only (situation, tap and red-flag codes).
-- A suggestion: the caller confirms each tap themselves. draft.triage is the caller's own (RLS caller_draft);
-- desk.triage is copied at confirmation so the operator sees it, labelled as the AI's suggestion.
alter table public.draft add column if not exists triage jsonb;
alter table public.desk add column if not exists triage jsonb;

-- The hand-off summary the operator reviewed (an AI draft, edited and saved by the operator who owns the case).
alter table public.desk add column if not exists ai_summary text check (ai_summary is null or char_length(ai_summary) <= 600);
alter table public.desk add column if not exists ai_summary_by text;
alter table public.desk add column if not exists ai_summary_at timestamptz;
