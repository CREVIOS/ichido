-- Training sessions accept every caller language (bn, en, ja, vi, id, ne), like real cases.
alter table public.training_session drop constraint if exists training_session_lang_check;
alter table public.training_session add constraint training_session_lang_check check (lang in ('bn', 'en', 'ja', 'vi', 'id', 'ne'));
