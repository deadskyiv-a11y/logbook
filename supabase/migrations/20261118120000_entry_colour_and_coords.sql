-- Store each entry's colour on the row so it never shifts when new entries
-- are added, and keep the GPS fix behind the location label.
-- All nullable and additive: existing rows need no backfill here (the app
-- writes the colour of older rows itself on first load after this runs),
-- and the existing "Owner only" RLS policy covers the new columns.
alter table public.entries
  add column if not exists colour text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists accuracy real;
