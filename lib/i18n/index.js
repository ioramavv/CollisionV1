"use client";
// Taal-Context voor de hele app (zie app/layout.js, die dit om alles heen
// wrapt). Werkt zowel ingelogd — profiles.locale is dan de bron van
// waarheid, zodat de taalkeuze aan het account gekoppeld blijft en bij elke
// volgende login vanzelf terugkomt — als uitgelogd (localStorage, met
// Engels als uiteindelijke standaard). Zie lib/i18n/locales.js voor de
// ondersteunde talen en lib/i18n/dictionaries/ voor de teksten zelf.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "./locales";
import en from "./dictionaries/en";
import nl from "./dictionaries/nl";
import de from "./dictionaries/de";
import fr from "./dictionaries/fr";
import es from "./dictionaries/es";
import it from "./dictionaries/it";

const DICTIONARIES = { en, nl, de, fr, es, it };
const STORAGE_KEY = "collision-locale";

const LanguageContext = createContext(null);

function readStoredLocale() {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(STORAGE_KEY);
  return SUPPORTED_LOCALES.includes(value) ? value : null;
}

// key -> tekst voor de huidige taal. Terugval: Engels (de basistaal), dan de
// key zelf — zo levert een ontbrekende vertaling nooit een kapotte pagina
// op. Ondersteunt zowel vaste strings als functie-waarden (params) => string
// voor teksten met een ingevulde naam/getal (woordvolgorde verschilt per
// taal, dus geen simpele stringconcatenatie).
function translate(dictionary, key, params) {
  const entry = dictionary[key] ?? DICTIONARIES.en[key] ?? key;
  return typeof entry === "function" ? entry(params || {}) : entry;
}

export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState(DEFAULT_LOCALE);
  const [userId, setUserId] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      const stored = readStoredLocale();
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;

      if (!user) {
        setLocaleState(stored || DEFAULT_LOCALE);
        setReady(true);
        return;
      }

      setUserId(user.id);
      const { data: profile } = await supabase.from("profiles").select("locale").eq("id", user.id).single();
      if (!active) return;

      if (profile?.locale && SUPPORTED_LOCALES.includes(profile.locale)) {
        setLocaleState(profile.locale);
      } else if (stored) {
        // Eerste keer inloggen met al een lokale taalkeuze: eenmalig aan het
        // account koppelen, zodat 'm vanaf nu overal terugkomt.
        setLocaleState(stored);
        supabase.from("profiles").update({ locale: stored }).eq("id", user.id);
      } else {
        setLocaleState(DEFAULT_LOCALE);
      }
      setReady(true);
    })();

    return () => { active = false; };
  }, []);

  const setLocale = useCallback((next) => {
    if (!SUPPORTED_LOCALES.includes(next)) return;
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage kan geblokkeerd zijn (privémodus e.d.) — dan werkt de
      // taalkeuze nog steeds voor deze sessie, alleen niet-onthouden zonder
      // account.
    }
    if (userId) supabase.from("profiles").update({ locale: next }).eq("id", userId);
  }, [userId]);

  // <html lang> pas zetten zodra de echte taal bekend is — de server-render
  // gebruikt "en" als eerste-paint-fallback (zie app/layout.js).
  useEffect(() => {
    if (ready) document.documentElement.lang = locale;
  }, [locale, ready]);

  const dictionary = DICTIONARIES[locale] || DICTIONARIES[DEFAULT_LOCALE];
  const t = useCallback((key, params) => translate(dictionary, key, params), [dictionary]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useTranslation must be used within a LanguageProvider");
  return ctx.t;
}

export function useLocale() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLocale must be used within a LanguageProvider");
  return [ctx.locale, ctx.setLocale];
}
