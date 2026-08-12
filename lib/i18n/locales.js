// Ondersteunde talen. Engels is de standaardtaal (voor iedereen die nog geen
// eigen keuze heeft gemaakt) — zie profiles.locale in supabase/schema.sql en
// lib/i18n/index.js voor hoe die keuze aan het account gekoppeld blijft.
// Labels zijn altijd de autoniemen (elke taal toont zijn eigen naam, dus
// altijd "Deutsch", nooit "German" of "Duits") — gebruikt door de taalknop.
export const SUPPORTED_LOCALES = ["en", "nl", "de", "fr", "es", "it"];
export const DEFAULT_LOCALE = "en";

export const LOCALE_LABELS = {
  en: "English",
  nl: "Nederlands",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  it: "Italiano",
};
