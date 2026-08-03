-- Collision — Supabase schema
-- Plak dit in het Supabase dashboard: SQL Editor -> New query -> Run

-- Helper: ruimt alle bestaande policies voor een tabel + commando-type op,
-- ongeacht hun naam. Voorkomt "policy already exists"-fouten wanneer een
-- policy ooit hernoemd is, of wanneer Postgres een te lange naam (>63
-- tekens) stilzwijgend heeft afgekapt — in beide gevallen matcht een
-- "drop policy if exists" met de naam uit dit bestand niet meer met wat
-- er echt in de database staat.
create or replace function _drop_all_policies(p_table text, p_cmd text)
returns void as $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = p_table and cmd = p_cmd
  loop
    execute format('drop policy %I on %I', pol.policyname, p_table);
  end loop;
end;
$$ language plpgsql;

-- Helper: is de ingelogde gebruiker de admin-account (JorADMIN)? Gebruikt
-- in policies die admin-only toegang nodig hebben.
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and username = 'JorADMIN'
  );
$$ language sql stable;

-- 1) Profielen (koppeling aan Supabase Auth users, met gebruikersnaam)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

select _drop_all_policies('profiles', 'SELECT');
create policy "Profielen zijn zichtbaar voor iedereen"
  on profiles for select
  using (true);

select _drop_all_policies('profiles', 'INSERT');
create policy "Gebruiker mag alleen eigen profiel aanmaken"
  on profiles for insert
  with check (auth.uid() = id);

select _drop_all_policies('profiles', 'UPDATE');
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
  -- Partij tegen de ingebouwde computerspeler (speler B). In dat geval
  -- blijft player_b altijd null en berekent de browser van player_a zelf
  -- de zetten van de computer — er is geen aparte databasegebruiker voor.
  vs_computer boolean not null default false,
  status text not null default 'waiting', -- waiting | active | finished
  state jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table games enable row level security;
alter table games add column if not exists invited_id uuid references profiles(id);
alter table games add column if not exists vs_computer boolean not null default false;

select _drop_all_policies('games', 'SELECT');
create policy "Zichtbaarheid van partijen"
  on games for select
  using (
    auth.uid() = player_a
    or auth.uid() = player_b
    or auth.uid() = invited_id
    or invited_id is null
    or is_admin()
  );

select _drop_all_policies('games', 'INSERT');
create policy "Ingelogde gebruiker mag een partij aanmaken"
  on games for insert
  with check (auth.uid() = player_a);

select _drop_all_policies('games', 'UPDATE');
create policy "Spelers mogen updaten, toegestane spelers mogen meespelen"
  on games for update
  using (
    auth.uid() = player_a
    or auth.uid() = player_b
    or (status = 'waiting' and (invited_id is null or auth.uid() = invited_id))
  );

select _drop_all_policies('games', 'DELETE');
create policy "Aanmaker mag wachtende partij verwijderen, admin altijd"
  on games for delete
  using ((auth.uid() = player_a and status = 'waiting') or is_admin());

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

select _drop_all_policies('archived_games', 'SELECT');
create policy "Gebruiker ziet alleen eigen archief"
  on archived_games for select
  using (auth.uid() = user_id);

select _drop_all_policies('archived_games', 'INSERT');
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

-- 4) Vriendschappen. Eén rij per verzoek/vriendschap; status gaat van
--    'pending' naar 'accepted'. Betrokkenen zijn requester en addressee.
create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references profiles(id) not null,
  addressee_id uuid references profiles(id) not null,
  status text not null default 'pending', -- pending | accepted
  created_at timestamptz default now(),
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

alter table friendships enable row level security;

select _drop_all_policies('friendships', 'SELECT');
create policy "Betrokkenen zien hun eigen vriendschappen"
  on friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

select _drop_all_policies('friendships', 'INSERT');
create policy "Gebruiker mag een vriendverzoek sturen"
  on friendships for insert
  with check (auth.uid() = requester_id);

select _drop_all_policies('friendships', 'UPDATE');
create policy "Ontvanger mag verzoek accepteren"
  on friendships for update
  using (auth.uid() = addressee_id);

select _drop_all_policies('friendships', 'DELETE');
create policy "Betrokkenen mogen verzoek of vriendschap verwijderen"
  on friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- 5) Feedback. Gebruikers kunnen feedback achterlaten; alleen de admin
--    (JorADMIN) kan de ingezonden feedback teruglezen.
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  message text not null,
  created_at timestamptz default now()
);

alter table feedback enable row level security;

select _drop_all_policies('feedback', 'INSERT');
create policy "Gebruiker mag feedback achterlaten"
  on feedback for insert
  with check (auth.uid() = user_id);

select _drop_all_policies('feedback', 'SELECT');
create policy "Alleen admin mag feedback lezen"
  on feedback for select
  using (is_admin());

-- 6) Chat per partij. Alleen de twee spelers van die partij (en de admin,
--    voor moderatie) mogen de berichten lezen; alleen de twee spelers
--    mogen er zelf berichten in plaatsen.
create table if not exists game_messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade not null,
  sender_id uuid references profiles(id) not null,
  body text not null,
  created_at timestamptz default now()
);

alter table game_messages enable row level security;

select _drop_all_policies('game_messages', 'SELECT');
create policy "Spelers en admin zien chat van hun eigen partij"
  on game_messages for select
  using (
    exists (
      select 1 from games g
      where g.id = game_id and (g.player_a = auth.uid() or g.player_b = auth.uid())
    )
    or is_admin()
  );

select _drop_all_policies('game_messages', 'INSERT');
create policy "Spelers mogen chatten in hun eigen partij"
  on game_messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from games g
      where g.id = game_id and (g.player_a = auth.uid() or g.player_b = auth.uid())
    )
  );

-- 7) Realtime aanzetten voor de games-, friendships-, feedback- en
--    game_messages-tabellen
create or replace function _ensure_realtime(p_table text)
returns void as $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = p_table
  ) then
    execute format('alter publication supabase_realtime add table %I', p_table);
  end if;
end;
$$ language plpgsql;

select _ensure_realtime('games');
select _ensure_realtime('friendships');
select _ensure_realtime('feedback');
select _ensure_realtime('game_messages');
