"use client";
// Bewerkbare site-teksten (sectietitels, kaartjes, uitlegpagina-stappen).
// DEFAULT_CONTENT is de tekst zoals die er al hardcoded stond — zolang de
// admin niets aanpast, ziet iedereen gewoon deze standaardwaarden. Alleen
// keys die de admin daadwerkelijk heeft gewijzigd staan in de
// site_content-tabel (zie app/(app)/admin/content/page.js); ontbreekt een
// key daar (of is Supabase niet bereikbaar), dan valt de tekst terug op
// wat hieronder staat, zodat de site nooit kapot kan gaan door deze feature.
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export const DEFAULT_CONTENT = {
  "lobby.section.myTurn": "Jouw beurt",
  "lobby.section.theirTurn": "Tegenstander aan zet",
  "lobby.section.finished": "Net afgelopen",
  "lobby.section.quickPlay": "Snel spelen",
  "lobby.section.stats": "Statistieken",
  "lobby.section.archived": "Gearchiveerde partijen",
  "lobby.section.open": "Open partijen",

  "lobby.card.invite.title": "Vriend uitnodigen",
  "lobby.card.invite.sub": "Speel 1-op-1",
  "lobby.card.computer.title": "Tegen de computer",
  "lobby.card.computer.sub": "4 niveaus",
  "lobby.card.local.title": "Lokaal spelen",
  "lobby.card.local.sub": "Samen op de bank",
  "lobby.card.open.title": "Open partij",
  "lobby.card.open.sub": "Iedereen mag joinen",
  "lobby.card.tutorial.title": "Uitleg",
  "lobby.card.tutorial.sub": "Leer de regels",

  "tutorial.step.1": "Dit is jouw pion, rechtsonder (uitgelicht). Klik erop om 'm te selecteren.",
  "tutorial.step.2": "Kies nu een richting. Je pion stuitert door tot-ie ergens tegenaan botst — de rand, het centrum, of een ander stuk.",
  "tutorial.step.3": "Je mag met hetzelfde stuk nog een keer stuiteren (ook een andere richting), of op STOP drukken om je beurt te beëindigen.",
  "tutorial.step.4": "Nu is de computer aan zet — te zien aan de kleurstip naast zijn naam hierboven.",
  "tutorial.step.5": "Je hebt ook 5 hulpstukken. Die kun je neerzetten om een pad te blokkeren of jezelf te beschermen — klik op \"Plaats hulpstuk\".",
  "tutorial.step.6": "Let op: een zet mag nooit een pion (van wie dan ook) volledig van het centrum afsluiten — het spel weigert zo'n zet automatisch.",
  "tutorial.step.7": "Dat is alles! Bereik als eerste met je pion het centrum om te winnen. Speel gewoon verder, of begin opnieuw.",
};

// Menselijk leesbare labels + groepering, gebruikt door de content-editor
// op de adminpagina — puur presentatie, geen invloed op de site zelf.
export const CONTENT_GROUPS = [
  {
    label: "Lobbypagina — sectietitels",
    keys: [
      { key: "lobby.section.myTurn", label: "\"Jouw beurt\"-blok" },
      { key: "lobby.section.theirTurn", label: "\"Tegenstander aan zet\"-blok" },
      { key: "lobby.section.finished", label: "\"Net afgelopen\"-blok" },
      { key: "lobby.section.quickPlay", label: "\"Snel spelen\"-blok" },
      { key: "lobby.section.stats", label: "\"Statistieken\"-blok" },
      { key: "lobby.section.archived", label: "\"Gearchiveerde partijen\"-blok" },
      { key: "lobby.section.open", label: "\"Open partijen\"-blok" },
    ],
  },
  {
    label: "Snel spelen — kaarten",
    keys: [
      { key: "lobby.card.invite.title", label: "Vriend uitnodigen — titel" },
      { key: "lobby.card.invite.sub", label: "Vriend uitnodigen — subtekst" },
      { key: "lobby.card.computer.title", label: "Tegen de computer — titel" },
      { key: "lobby.card.computer.sub", label: "Tegen de computer — subtekst" },
      { key: "lobby.card.local.title", label: "Lokaal spelen — titel" },
      { key: "lobby.card.local.sub", label: "Lokaal spelen — subtekst" },
      { key: "lobby.card.open.title", label: "Open partij — titel" },
      { key: "lobby.card.open.sub", label: "Open partij — subtekst" },
      { key: "lobby.card.tutorial.title", label: "Uitleg — titel" },
      { key: "lobby.card.tutorial.sub", label: "Uitleg — subtekst" },
    ],
  },
  {
    label: "Uitlegpagina — stappen",
    keys: [
      { key: "tutorial.step.1", label: "Stap 1", multiline: true },
      { key: "tutorial.step.2", label: "Stap 2", multiline: true },
      { key: "tutorial.step.3", label: "Stap 3", multiline: true },
      { key: "tutorial.step.4", label: "Stap 4", multiline: true },
      { key: "tutorial.step.5", label: "Stap 5", multiline: true },
      { key: "tutorial.step.6", label: "Stap 6", multiline: true },
      { key: "tutorial.step.7", label: "Stap 7", multiline: true },
    ],
  },
];

async function fetchOverrides() {
  const { data } = await supabase.from("site_content").select("key, value");
  const map = {};
  (data || []).forEach((row) => { map[row.key] = row.value; });
  return map;
}

// Haalt eventuele overrides op en houdt ze live bij (realtime), zodat een
// wijziging door de admin meteen overal doorkomt zonder te verversen.
export function useSiteContent() {
  const [overrides, setOverrides] = useState({});

  useEffect(() => {
    let active = true;

    fetchOverrides().then((map) => { if (active) setOverrides(map); });

    const channel = supabase
      .channel("site-content-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_content" }, () => {
        fetchOverrides().then((map) => { if (active) setOverrides(map); });
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return (key) => overrides[key] ?? DEFAULT_CONTENT[key] ?? key;
}
