"use client";
// Thema-Context voor de hele app (zie app/layout.js, die dit om alles heen
// wrapt) — zelfde opzet als lib/i18n/index.js voor de taalkeuze. Werkt zowel
// ingelogd — profiles.theme is dan de bron van waarheid, zodat de keuze aan
// het account gekoppeld blijft en bij elke volgende login vanzelf terugkomt —
// als uitgelogd (localStorage, met "dark" als uiteindelijke standaard, zodat
// niemands scherm verandert totdat ze zelf kiezen).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export const SUPPORTED_THEMES = ["dark", "woody", "light"];
export const DEFAULT_THEME = "dark";

const STORAGE_KEY = "collision-theme";

const ThemeContext = createContext(null);

function readStoredTheme() {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(STORAGE_KEY);
  return SUPPORTED_THEMES.includes(value) ? value : null;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(DEFAULT_THEME);
  const [userId, setUserId] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      const stored = readStoredTheme();
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;

      if (!user) {
        setThemeState(stored || DEFAULT_THEME);
        setReady(true);
        return;
      }

      setUserId(user.id);
      const { data: profile } = await supabase.from("profiles").select("theme").eq("id", user.id).single();
      if (!active) return;

      if (profile?.theme && SUPPORTED_THEMES.includes(profile.theme)) {
        setThemeState(profile.theme);
      } else if (stored) {
        // Eerste keer inloggen met al een lokale themakeuze: eenmalig aan
        // het account koppelen, zodat 'm vanaf nu overal terugkomt.
        setThemeState(stored);
        supabase.from("profiles").update({ theme: stored }).eq("id", user.id);
      } else {
        setThemeState(DEFAULT_THEME);
      }
      setReady(true);
    })();

    return () => { active = false; };
  }, []);

  const setTheme = useCallback((next) => {
    if (!SUPPORTED_THEMES.includes(next)) return;
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage kan geblokkeerd zijn (privémodus e.d.) — dan werkt de
      // themakeuze nog steeds voor deze sessie, alleen niet-onthouden zonder
      // account.
    }
    if (userId) supabase.from("profiles").update({ theme: next }).eq("id", userId);
  }, [userId]);

  // data-theme pas zetten zodra de echte keuze bekend is — :root in
  // globals.css bevat al de dark-waarden als eerste-paint-fallback, dus dit
  // geeft geen flits (zelfde redenering als <html lang> in lib/i18n/index.js).
  useEffect(() => {
    if (ready) document.documentElement.dataset.theme = theme;
  }, [theme, ready]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return [ctx.theme, ctx.setTheme];
}
