-- Three more caller languages: Vietnamese, Indonesian and Nepali (the largest foreign-worker nationalities
-- in Nagasaki Prefecture). Keep in step with LANGS in web/content/catalogue.ts.
alter table public.desk drop constraint desk_lang_check,
  add constraint desk_lang_check check (lang in ('bn', 'en', 'ja', 'vi', 'id', 'ne'));
alter table ichido.binding drop constraint binding_lang_check,
  add constraint binding_lang_check check (lang in ('bn', 'en', 'ja', 'vi', 'id', 'ne'));
alter table public.caller_card drop constraint caller_card_lang_check,
  add constraint caller_card_lang_check check (lang in ('bn', 'en', 'ja', 'vi', 'id', 'ne'));

-- Existing stations get the new keys with their English text until someone writes the translation;
-- keys already present are kept (the right-hand side of || wins).
update public.station set
  label = jsonb_build_object('vi', label->'en', 'id', label->'en', 'ne', label->'en') || label,
  branch = jsonb_build_object('vi', branch->'en', 'id', branch->'en', 'ne', branch->'en') || branch,
  counter_hours = jsonb_build_object('vi', counter_hours->'en', 'id', counter_hours->'en', 'ne', counter_hours->'en') || counter_hours
where not (label ?& array['vi', 'id', 'ne'] and branch ?& array['vi', 'id', 'ne'] and counter_hours ?& array['vi', 'id', 'ne']);
