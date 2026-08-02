-- Collision — Supabase schema
-- Plak dit in het Supabase dashboard: SQL Editor -> New query -> Run

-- 1) Profielen (koppeling aan Supabase Auth users, met gebruikersnaam)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists "Profielen zijn zichtbaar voor iedereen" on profiles;
create policy "Profielen zijn zichtbaar voor iedereen"
  on profiles for select
  using (true);

drop policy if exists "Gebruiker mag alleen eigen profiel aanmaken" on profiles;
create policy "Gebruiker mag alleen eigen profiel aanmaken"
  on profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Gebruiker mag alleen eigen profiel aanpassen" on profiles;
create policy "Gebruiker mag alleen eigen profiel aanpassen"
  on profiles for update
  using (auth.uid() = id);

-- Automatisch een profiel aanmaken zodra iemand zich registreert
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- 2) Partijen. De volledige spelstaat (bord, pionposities, beurt, etc.)
--    wordt als jsonb opgeslagen — dat is wat de client leest/schrijft en
--    wat via Supabase Realtime naar beide spelers gestreamd wordt.
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  player_a uuid references profiles(id) not null,
  player_b uuid references profiles(id),
  -- Als gezet: deze partij is een directe uitnodiging en is (totdat iemand
  -- meespeelt) alleen zichtbaar voor player_a en invited_id, niet voor
  -- iedereen. Null betekent: openbare partij, zoals voorheen.
  invited_id uuid references profiles(id),
  status text not null default 'waiting', -- waiting | active | finished
  state jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table games enable row level security;
alter table games add column if not exists invited_id uuid references profiles(id);

drop policy if exists "Partijen zijn zichtbaar voor iedereen" on games;
create policy "Open partijen zijn zichtbaar voor iedereen, uitnodigingen alleen voor betrokkenen"
  on games for select
  using (
    auth.uid() = player_a
    or auth.uid() = player_b
    or auth.uid() = invited_id
    or invited_id is null
  );

drop policy if exists "Ingelogde gebruiker mag een partij aanmaken" on games;
create policy "Ingelogde gebruiker mag een partij aanmaken"
  on games for insert
  with check (auth.uid() = player_a);

drop policy if exists "Alleen de twee spelers mogen de partij updaten" on games;
create policy "Spelers mogen updaten, toegestane spelers mogen meespelen"
  on games for update
  using (
    auth.uid() = player_a
    or auth.uid() = player_b
    or (status = 'waiting' and (invited_id is null or auth.uid() = invited_id))
  );

-- updated_at automatisch bijwerken
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists games_set_updated_at on games;
create trigger games_set_updated_at
  before update on games
  for each row execute procedure set_updated_at();

-- 3) Realtime aanzetten voor de games-tabel
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table games;
  end if;
end $$;
