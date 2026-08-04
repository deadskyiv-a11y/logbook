-- Tags for entries. Additive with a default, so existing rows need no backfill
-- and the existing "Owner only" RLS policy covers the new column automatically.
alter table public.entries add column tags text[] not null default '{}';
create index entries_tags_idx on public.entries using gin (tags);
