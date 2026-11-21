-- Horvati voćnjak – javno: ostali podaci voćnjaka (korak 3).
-- Jedna tablica za: stanje zadataka u rasporedu, zadatke po stablu, vlastite zadatke,
-- gredice i novčanik. Novčanik vidi i mijenja samo vlasnik voćnjaka.
-- Pokreni jednom u Supabaseu: SQL Editor -> New query -> zalijepi sve -> Run.

create table if not exists public.orchard_items (
  orchard_id uuid not null references public.orchards (id) on delete cascade,
  kind text not null check (kind in ('task', 'ttask', 'ctask', 'bed', 'wallet')),
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (orchard_id, kind, id)
);

drop trigger if exists orchard_items_touch on public.orchard_items;
create trigger orchard_items_touch
  before update on public.orchard_items
  for each row execute function public.touch_updated_at();

alter table public.orchard_items enable row level security;

drop policy if exists "items: članovi vide" on public.orchard_items;
create policy "items: članovi vide" on public.orchard_items
  for select to authenticated
  using (
    public.orchard_role(orchard_id) is not null
    and (kind <> 'wallet' or public.orchard_role(orchard_id) = 'owner')
  );

drop policy if exists "items: vlasnik i urednik pišu" on public.orchard_items;
create policy "items: vlasnik i urednik pišu" on public.orchard_items
  for all to authenticated
  using (
    public.orchard_role(orchard_id) in ('owner', 'editor')
    and (kind <> 'wallet' or public.orchard_role(orchard_id) = 'owner')
  )
  with check (
    public.orchard_role(orchard_id) in ('owner', 'editor')
    and (kind <> 'wallet' or public.orchard_role(orchard_id) = 'owner')
  );

grant select, insert, update, delete on public.orchard_items to authenticated;
