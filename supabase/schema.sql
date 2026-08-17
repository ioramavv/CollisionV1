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
  -- Elo-rating, net als bij chess.com. Begint op 1200 en wordt alleen
  -- bijgewerkt na afgeronde partijen tussen twee echte spelers (dus niet
  -- tegen de computer) — zie apply_game_rating() hieronder.
  rating integer not null default 1200,
  rating_games integer not null default 0,
  -- Publieke URL van een geüploade profielfoto (storage-bucket "avatars",
  -- zie onderaan dit bestand). Null = geen foto, dan valt de UI terug op de
  -- gekleurde initiaal-cirkel (Avatar-component in lib/ui.js).
  avatar_url text,
  -- Taalvoorkeur ("en"/"nl"/"de"/"fr"/"es"/"it"). Null = nog geen keuze
  -- gemaakt, dan valt de UI terug op Engels (zie lib/i18n/index.js) — zo
  -- blijft de taalkeuze aan het account gekoppeld en komt 'm bij elke
  -- volgende login vanzelf terug, in plaats van telkens opnieuw ingesteld
  -- te moeten worden.
  locale text,
  -- Themavoorkeur ("dark"/"woody"/"light"). Null = nog geen keuze gemaakt,
  -- dan valt de UI terug op dark (zie lib/theme.js) — zelfde opzet als
  -- locale hierboven, aan het account gekoppeld zodat 'm bij elke volgende
  -- login vanzelf terugkomt.
  theme text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table profiles add column if not exists rating integer not null default 1200;
alter table profiles add column if not exists rating_games integer not null default 0;
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists locale text;
alter table profiles add column if not exists theme text;

select _drop_all_policies('profiles', 'SELECT');
create policy "Profielen zijn zichtbaar voor iedereen"
  on profiles for select
  using (true);

select _drop_all_policies('profiles', 'INSERT');
create policy "Gebruiker mag alleen eigen profiel aanmaken"
  on profiles for insert
  with check (auth.uid() = id);

select _drop_all_policies('profiles', 'UPDATE');
create policy "Gebruiker mag eigen profiel aanpassen, admin mag alle profielen aanpassen"
  on profiles for update
  using (auth.uid() = id or is_admin());

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
  -- Moeilijkheidsgraad van de computerspeler, alleen relevant als
  -- vs_computer waar is. Zie lib/collisionAI.js voor de betekenis.
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard', 'expert')),
  -- "Pass-and-play" op één apparaat: player_a bestuurt om beurten beide
  -- kanten (net als bij vs_computer blijft player_b leeg). De namen van
  -- beide kanten staan in state.localNames, niet in een aparte kolom.
  local_multiplayer boolean not null default false,
  status text not null default 'waiting', -- waiting | active | finished
  -- Wordt precies één keer op waar gezet zodra apply_game_rating() de
  -- Elo-uitslag van deze partij heeft verwerkt, zodat dat nooit dubbel kan.
  rating_applied boolean not null default false,
  state jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table games enable row level security;
alter table games add column if not exists invited_id uuid references profiles(id);
alter table games add column if not exists vs_computer boolean not null default false;
alter table games add column if not exists difficulty text not null default 'medium';
alter table games drop constraint if exists games_difficulty_check;
alter table games add constraint games_difficulty_check check (difficulty in ('easy', 'medium', 'hard', 'expert'));
alter table games add column if not exists rating_applied boolean not null default false;
alter table games add column if not exists local_multiplayer boolean not null default false;

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

-- Verwerkt de Elo-rating van een afgeronde partij tussen twee echte spelers.
-- Wordt door de client aangeroepen (via supabase.rpc) zodra een partij
-- eindigt. security definer omdat de aanroepende speler alleen zijn eigen
-- profiel mag updaten (zie de UPDATE-policy op profiles) — deze functie mag
-- namens beide spelers de rating bijwerken, maar alleen voor de exacte,
-- deterministische Elo-uitkomst van een reeds afgeronde partij, en enkel op
-- initiatief van één van de twee spelers zelf. `for update` + de
-- rating_applied-vlag zorgen dat dit nooit dubbel toegepast wordt, ook niet
-- als beide spelers de aanroep gelijktijdig doen.
create or replace function apply_game_rating(p_game_id uuid)
returns void as $$
declare
  g games%rowtype;
  v_winner text;
  rating_a integer;
  rating_b integer;
  games_a integer;
  games_b integer;
  k_a numeric;
  k_b numeric;
  expected_a numeric;
  score_a numeric;
  new_rating_a integer;
  new_rating_b integer;
begin
  select * into g from games where id = p_game_id for update;
  if not found then return; end if;

  if g.vs_computer or g.status <> 'finished' or g.rating_applied or g.player_b is null then
    return;
  end if;

  if auth.uid() is distinct from g.player_a and auth.uid() is distinct from g.player_b then
    return;
  end if;

  v_winner := g.state->>'winner';
  if v_winner is null then return; end if;

  select rating, rating_games into rating_a, games_a from profiles where id = g.player_a;
  select rating, rating_games into rating_b, games_b from profiles where id = g.player_b;

  -- Zelfde soort K-factor-trapjes als chess.com/FIDE: de rating van nieuwe
  -- spelers beweegt sneller, die van gevestigde topspelers juist trager.
  k_a := case when games_a < 30 then 40 when rating_a >= 2400 then 10 else 20 end;
  k_b := case when games_b < 30 then 40 when rating_b >= 2400 then 10 else 20 end;

  expected_a := 1.0 / (1 + power(10.0, (rating_b - rating_a)::numeric / 400.0));
  score_a := case when v_winner = 'A' then 1 else 0 end;

  new_rating_a := round(rating_a + k_a * (score_a - expected_a));
  new_rating_b := round(rating_b + k_b * ((1 - score_a) - (1 - expected_a)));

  update games set rating_applied = true where id = p_game_id;
  update profiles set rating = new_rating_a, rating_games = rating_games + 1 where id = g.player_a;
  update profiles set rating = new_rating_b, rating_games = rating_games + 1 where id = g.player_b;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function apply_game_rating(uuid) to authenticated;

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

select _drop_all_policies('feedback', 'DELETE');
create policy "Alleen admin mag feedback verwijderen"
  on feedback for delete
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

-- 7) Realtime aanzetten voor de games-, friendships-, feedback-,
--    game_messages- en announcements-tabellen
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
select _ensure_realtime('announcements');

-- 8) Storage-bucket voor profielfoto's. Publiek leesbaar (avatars zijn
--    sowieso al overal zichtbaar, net als usernames), maar iedereen mag
--    alleen bestanden in zijn eigen map (avatars/<user_id>/...) uploaden,
--    overschrijven of verwijderen. storage.objects zit niet in de 'public'-
--    schema, dus _drop_all_policies (die is vastgezet op schemaname =
--    'public') werkt hier niet — vandaar losse "drop policy if exists".
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatars zijn publiek leesbaar" on storage.objects;
create policy "Avatars zijn publiek leesbaar"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Gebruiker mag alleen in eigen avatar-map uploaden" on storage.objects;
create policy "Gebruiker mag alleen in eigen avatar-map uploaden"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Gebruiker mag eigen avatar overschrijven" on storage.objects;
create policy "Gebruiker mag eigen avatar overschrijven"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Gebruiker mag eigen avatar verwijderen" on storage.objects;
create policy "Gebruiker mag eigen avatar verwijderen"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 9) Genegeerde afgeronde partijen. Zodra een partij eindigt, verdwijnt hij
--    uit "Jouw beurt"/"Tegenstander aan zet" (die tonen alleen actieve
--    partijen) — de lobbypagina toont 'm daarna nog even apart onder "Net
--    afgelopen", met de keuze om 'm te archiveren (zie archived_games) of
--    te negeren. Deze tabel onthoudt die laatste keuze, zodat een genegeerde
--    partij niet steeds terugkomt.
create table if not exists dismissed_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  game_id uuid references games(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (user_id, game_id)
);

alter table dismissed_games enable row level security;

select _drop_all_policies('dismissed_games', 'SELECT');
create policy "Gebruiker ziet alleen eigen genegeerde partijen"
  on dismissed_games for select
  using (auth.uid() = user_id);

select _drop_all_policies('dismissed_games', 'INSERT');
create policy "Gebruiker mag eigen afgeronde partij negeren"
  on dismissed_games for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from games g
      where g.id = game_id
        and g.status = 'finished'
        and (g.player_a = auth.uid() or g.player_b = auth.uid())
    )
  );

-- 10) Meldingen (announcements). Door de admin opgestelde berichten die als
--     dismissable balkje bovenaan bij iedereen te zien zijn (zie de
--     kopbalk in app/(app)/layout.js) — bv. voor onderhoud of nieuwe
--     features. `active` bepaalt of een melding nog getoond wordt; wie 'm al
--     heeft weggeklikt onthoudt de client zelf (localStorage), niet de
--     database.
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  active boolean not null default true,
  created_by uuid references profiles(id) not null,
  created_at timestamptz default now()
);

alter table announcements enable row level security;

select _drop_all_policies('announcements', 'SELECT');
create policy "Iedereen mag meldingen lezen"
  on announcements for select
  using (true);

select _drop_all_policies('announcements', 'INSERT');
create policy "Alleen admin mag meldingen aanmaken"
  on announcements for insert
  with check (is_admin() and auth.uid() = created_by);

select _drop_all_policies('announcements', 'UPDATE');
create policy "Alleen admin mag meldingen wijzigen"
  on announcements for update
  using (is_admin());

select _drop_all_policies('announcements', 'DELETE');
create policy "Alleen admin mag meldingen verwijderen"
  on announcements for delete
  using (is_admin());

-- 11) Site-inhoud (site_content). Key/waarde-paren waarmee de admin losse
--     teksten in de UI (sectietitels, kaartjes, uitlegpagina-stappen) kan
--     overschrijven zonder code te wijzigen — zie app/(app)/admin/content/
--     page.js en lib/siteContent.js. Alleen keys die daadwerkelijk van de
--     standaardtekst afwijken staan hier; ontbreekt een key, dan valt de
--     UI terug op DEFAULT_CONTENT in lib/siteContent.js.
create table if not exists site_content (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

alter table site_content enable row level security;

drop trigger if exists site_content_set_updated_at on site_content;
create trigger site_content_set_updated_at
  before update on site_content
  for each row execute procedure set_updated_at();

select _drop_all_policies('site_content', 'SELECT');
create policy "Iedereen mag site-teksten lezen"
  on site_content for select
  using (true);

select _drop_all_policies('site_content', 'INSERT');
create policy "Alleen admin mag site-teksten aanmaken"
  on site_content for insert
  with check (is_admin());

select _drop_all_policies('site_content', 'UPDATE');
create policy "Alleen admin mag site-teksten wijzigen"
  on site_content for update
  using (is_admin());

select _drop_all_policies('site_content', 'DELETE');
create policy "Alleen admin mag site-teksten verwijderen"
  on site_content for delete
  using (is_admin());

-- 12) Opgeloste bugs (bugfixes). Vervangt het vroegere hardcoded
--     lib/bugfixes.js — nu met vertalingen per taal (title/detail als jsonb,
--     bv. {"en": "...", "nl": "...", ...}) en een goedkeuringsstap: een
--     nieuwe entry is pas zichtbaar voor gebruikers zodra de admin 'm
--     bevestigt (confirmed = true) via de adminpagina. Rendering leest
--     title[locale] met terugval op title.nl (het origineel).
create table if not exists bugfixes (
  id uuid primary key default gen_random_uuid(),
  title jsonb not null default '{}'::jsonb,
  detail jsonb not null default '{}'::jsonb,
  confirmed boolean not null default false,
  created_at timestamptz default now()
);

alter table bugfixes enable row level security;

select _drop_all_policies('bugfixes', 'SELECT');
create policy "Iedereen ziet bevestigde bugfixes, admin ziet alles"
  on bugfixes for select
  using (confirmed = true or is_admin());

select _drop_all_policies('bugfixes', 'INSERT');
create policy "Alleen admin mag bugfixes aanmaken"
  on bugfixes for insert
  with check (is_admin());

select _drop_all_policies('bugfixes', 'UPDATE');
create policy "Alleen admin mag bugfixes wijzigen"
  on bugfixes for update
  using (is_admin());

select _drop_all_policies('bugfixes', 'DELETE');
create policy "Alleen admin mag bugfixes verwijderen"
  on bugfixes for delete
  using (is_admin());

select _ensure_realtime('site_content');
select _ensure_realtime('bugfixes');

-- 13) Admin to-do's. Puur een privé planninglijstje voor de admin (JorADMIN)
--     zelf — een plek om verzoeken/ideeën te verzamelen die later samen
--     afgewerkt worden, i.p.v. verspreid over losse chatberichten.
create table if not exists admin_todos (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  done boolean not null default false,
  created_at timestamptz default now(),
  done_at timestamptz
);

alter table admin_todos enable row level security;

select _drop_all_policies('admin_todos', 'SELECT');
create policy "Alleen admin mag to-do's lezen"
  on admin_todos for select
  using (is_admin());

select _drop_all_policies('admin_todos', 'INSERT');
create policy "Alleen admin mag to-do's aanmaken"
  on admin_todos for insert
  with check (is_admin());

select _drop_all_policies('admin_todos', 'UPDATE');
create policy "Alleen admin mag to-do's wijzigen"
  on admin_todos for update
  using (is_admin());

select _drop_all_policies('admin_todos', 'DELETE');
create policy "Alleen admin mag to-do's verwijderen"
  on admin_todos for delete
  using (is_admin());

select _ensure_realtime('admin_todos');
