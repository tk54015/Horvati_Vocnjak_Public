-- Horvati voćnjak – javno: stabla (korak 2).
-- Pokreni jednom u Supabaseu: SQL Editor -> New query -> zalijepi sve -> Run.
-- Sigurno je pokrenuti ponovno.

create table if not exists public.trees (
  id uuid primary key default gen_random_uuid(),
  orchard_id uuid not null references public.orchards (id) on delete cascade,
  species text not null,
  name text not null check (char_length(name) between 1 and 80),
  lat double precision not null,
  lng double precision not null,
  height_m numeric,
  stage text,             -- mlado | odraslo
  canopy text,            -- mala | srednja | velika
  notes text,
  data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trees_orchard_idx on public.trees (orchard_id);

drop trigger if exists trees_touch on public.trees;
create trigger trees_touch
  before update on public.trees
  for each row execute function public.touch_updated_at();

alter table public.trees enable row level security;

drop policy if exists "trees: članovi vide" on public.trees;
create policy "trees: članovi vide" on public.trees
  for select to authenticated
  using (public.orchard_role(orchard_id) is not null);

drop policy if exists "trees: vlasnik i urednik dodaju" on public.trees;
create policy "trees: vlasnik i urednik dodaju" on public.trees
  for insert to authenticated
  with check (public.orchard_role(orchard_id) in ('owner', 'editor'));

drop policy if exists "trees: vlasnik i urednik mijenjaju" on public.trees;
create policy "trees: vlasnik i urednik mijenjaju" on public.trees
  for update to authenticated
  using (public.orchard_role(orchard_id) in ('owner', 'editor'))
  with check (public.orchard_role(orchard_id) in ('owner', 'editor'));

drop policy if exists "trees: vlasnik i urednik brišu" on public.trees;
create policy "trees: vlasnik i urednik brišu" on public.trees
  for delete to authenticated
  using (public.orchard_role(orchard_id) in ('owner', 'editor'));

grant select, insert, update, delete on public.trees to authenticated;
