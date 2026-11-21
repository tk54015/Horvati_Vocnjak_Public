-- Horvati voćnjak – javno: tablice i pravila pristupa (Row Level Security).
-- Pokreni jednom u Supabaseu: SQL Editor -> New query -> zalijepi sve -> Run.
-- Sigurno je pokrenuti ponovno (ne briše podatke).

-- ---------------------------------------------------------------------------
-- Voćnjaci
-- ---------------------------------------------------------------------------
create table if not exists public.orchards (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  address text,
  boundary jsonb,          -- { type: 'rect'|'polygon', rect?, points: [[lat,lng],...] }
  area numeric,            -- m²
  center jsonb,            -- [lat, lng]
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Članovi voćnjaka i uloge: owner (vlasnik), editor (uređuje), viewer (samo gleda)
create table if not exists public.orchard_members (
  orchard_id uuid not null references public.orchards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (orchard_id, user_id)
);

create index if not exists orchard_members_user_idx on public.orchard_members (user_id);

-- Uloga prijavljenog korisnika u voćnjaku (security definer: izbjegava rekurziju u pravilima)
create or replace function public.orchard_role(o uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.orchard_members where orchard_id = o and user_id = auth.uid()
$$;

-- Tko napravi voćnjak, automatski postaje vlasnik
create or replace function public.add_orchard_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.orchard_members (orchard_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists orchards_add_owner on public.orchards;
create trigger orchards_add_owner
  after insert on public.orchards
  for each row execute function public.add_orchard_owner();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orchards_touch on public.orchards;
create trigger orchards_touch
  before update on public.orchards
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Pravila pristupa
-- ---------------------------------------------------------------------------
alter table public.orchards enable row level security;
alter table public.orchard_members enable row level security;

drop policy if exists "orchards: članovi vide" on public.orchards;
create policy "orchards: članovi vide" on public.orchards
  for select to authenticated
  using (public.orchard_role(id) is not null or created_by = auth.uid());

drop policy if exists "orchards: prijavljeni stvaraju" on public.orchards;
create policy "orchards: prijavljeni stvaraju" on public.orchards
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "orchards: vlasnik i urednik mijenjaju" on public.orchards;
create policy "orchards: vlasnik i urednik mijenjaju" on public.orchards
  for update to authenticated
  using (public.orchard_role(id) in ('owner', 'editor'))
  with check (public.orchard_role(id) in ('owner', 'editor'));

drop policy if exists "orchards: vlasnik briše" on public.orchards;
create policy "orchards: vlasnik briše" on public.orchards
  for delete to authenticated
  using (public.orchard_role(id) = 'owner');

drop policy if exists "members: članovi vide članove" on public.orchard_members;
create policy "members: članovi vide članove" on public.orchard_members
  for select to authenticated
  using (user_id = auth.uid() or public.orchard_role(orchard_id) is not null);

drop policy if exists "members: vlasnik upravlja" on public.orchard_members;
create policy "members: vlasnik upravlja" on public.orchard_members
  for all to authenticated
  using (public.orchard_role(orchard_id) = 'owner')
  with check (public.orchard_role(orchard_id) = 'owner');

grant select, insert, update, delete on public.orchards to authenticated;
grant select, insert, update, delete on public.orchard_members to authenticated;
