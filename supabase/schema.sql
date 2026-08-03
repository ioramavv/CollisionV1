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

-- Ruimt élke bestaande select-policy op games op, ongeacht naam. Nodig
-- omdat een eerdere (te lange) policy-naam door Postgres' 63-tekenlimiet
-- werd afgekapt, waardoor "drop policy if exists" met de volledige naam
-- 'm niet meer terugvond.
do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'games' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on games', pol.policyname);
  end loop;
end $$;

create policy "Zichtbaarheid van partijen"
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

-- 3) Archief. Slaat NIET een kopie van het bord op — alleen een verwijzing
--    naar de bestaande games-rij, zodat dit vrijwel geen ruimte kost.
--    Per gebruiker worden maximaal 3 gearchiveerde partijen bewaard; de
--    trigger hieronder ruimt de oudste(n) op zodra dat er meer worden.
create table if not exists archived_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  game_id uuid references games(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (user_id, game_id)
);

alter table archived_games enable row level security;

drop policy if exists "Gebruiker ziet alleen eigen archief" on archived_games;
create policy "Gebruiker ziet alleen eigen archief"
  on archived_games for select
  using (auth.uid() = user_id);

drop policy if exists "Gebruiker mag eigen afgeronde partij archiveren" on archived_games;
create policy "Gebruiker mag eigen afgeronde partij archiveren"
  on archived_games for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from games g
      where g.id = game_id
        and g.status = 'finished'
        and (g.player_a = auth.uid() or g.player_b = auth.uid())
    )
  );

create or replace function enforce_archive_limit()
returns trigger as $$
begin
  delete from archived_games
  where user_id = new.user_id
    and id not in (
      select id from archived_games
      where user_id = new.user_id
      order by created_at desc
      limit 3
    );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists archived_games_enforce_limit on archived_games;
create trigger archived_games_enforce_limit
  after insert on archived_games
  for each row execute procedure enforce_archive_limit();

-- 4) Realtime aanzetten voor de games-tabel
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table games;
  end if;
end $$;
