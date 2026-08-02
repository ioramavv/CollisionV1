# Collision — collision.iorama.nl

Online versie van het bordspel Collision (Mosquito Games). Gebouwd met
Next.js + Supabase (accounts, database, real-time synchronisatie).

## 1. Supabase-project aanmaken

1. Ga naar https://supabase.com en maak een gratis account/project aan.
2. Ga naar **SQL Editor** en plak de inhoud van `supabase/schema.sql`. Klik **Run**.
   Dit maakt de tabellen `profiles` en `games` aan, met de juiste
   beveiligingsregels en real-time updates.
3. Ga naar **Project Settings → API**. Kopieer de **Project URL** en de
   **anon public key**.

## 2. Project lokaal draaien

```bash
npm install
cp .env.local.example .env.local
```

Vul in `.env.local` je eigen Supabase URL en anon key in.

```bash
npm run dev
```

Open http://localhost:3000 — registreer twee accounts (bijv. in twee
verschillende browservensters) om een partij te testen.

## 3. Online zetten via Vercel

1. Zet dit project in een GitHub-repository (`git init`, `git add .`,
   `git commit`, dan naar GitHub pushen).
2. Ga naar https://vercel.com, maak een gratis account, en importeer de
   GitHub-repository.
3. Voeg bij **Environment Variables** dezelfde twee Supabase-waarden toe
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. Klik **Deploy**.

## 4. collision.iorama.nl koppelen

1. In Vercel: ga naar je project → **Settings → Domains** → voeg
   `collision.iorama.nl` toe.
2. Vercel geeft je een CNAME-waarde (iets als `cname.vercel-dns.com`).
3. Log in bij mijndomein.nl, ga naar het DNS-beheer van `iorama.nl`, en
   voeg een **CNAME-record** toe:
   - Naam: `collision`
   - Waarde: (de waarde die Vercel je geeft)
4. Na een paar minuten (soms langer) is `collision.iorama.nl` live.

## Projectstructuur

- `lib/collisionEngine.js` — alle spelregels (stuiterbeweging, plaatsen
  van hulpstukken, win-conditie, de "geen-opsluiting"-check). Puur
  JavaScript, geen afhankelijkheden — makkelijk te testen en later ook
  server-side te hergebruiken.
- `lib/supabaseClient.js` — verbinding met Supabase.
- `supabase/schema.sql` — databaseschema, in één keer te draaien.
- `app/` — de pagina's: landing, login, registreren, lobby, spelpagina.

## Bekende beperkingen (vervolgstappen)

- Zetten worden nu **client-side gevalideerd**, niet server-side. Voor een
  eerlijk online spel kun je dit later verplaatsen naar een Supabase Edge
  Function, zodat een speler niet kan frauderen door de browser-console
  te gebruiken.
- Er is nog geen rating/Elo-systeem, geen partijgeschiedenis-viewer, en
  geen wachtrij/matchmaking (alleen een open-partijen lijst in de lobby).
- Bij tussentijdse stuiterzetten (meerdere richtingen in één beurt) ziet
  de tegenstander pas de eindpositie wanneer de beurt eindigt, niet elke
  losse stuiterbeweging live.
