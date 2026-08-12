"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Swords, Users, MessageSquarePlus, ShieldCheck, LogOut, X, HelpCircle, UserCircle, Megaphone, Globe, SunMoon } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Avatar, Logo } from "@/lib/ui";
import { rememberDevSession, isDevAccount } from "@/lib/devAccountSwitch";
import { useTranslation, useLocale } from "@/lib/i18n";
import { SUPPORTED_LOCALES, LOCALE_LABELS } from "@/lib/i18n/locales";
import { useTheme, SUPPORTED_THEMES } from "@/lib/theme";

// labelKey i.p.v. een vaste tekst — vertaald ten tijde van renderen (zie
// t(link.labelKey) hieronder), zodat dezelfde lijst voor zowel de
// desktop-zijbalk, de mobiele kopbalk als de onderbalk kan dienen.
const LINKS = [
  { href: "/lobby", labelKey: "layout.nav.lobby", icon: Swords },
  { href: "/friends", labelKey: "layout.nav.friends", icon: Users },
  { href: "/tutorial", labelKey: "layout.nav.tutorial", icon: HelpCircle },
];

export default function AppLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslation();
  const [locale, setLocale] = useLocale();
  const [theme, setTheme] = useTheme();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [announcements, setAnnouncements] = useState([]);
  // Sluit het account-menu automatisch zodra er (client-side) genavigeerd
  // wordt, zodat het niet openstaat blijft na het kiezen van een link.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setAccountMenuOpen(false);
    setLangMenuOpen(false);
    setThemeMenuOpen(false);
  }

  useEffect(() => {
    let active = true;
    let channel;
    let friendsChannel;
    let announcementsChannel;

    async function refreshPendingRequests(userId) {
      const { count } = await supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("addressee_id", userId)
        .eq("status", "pending");
      if (active) setPendingRequests(count || 0);
    }

    // Meldingen (zie admin-pagina) — wie een melding wegklikt, onthoudt dat
    // zelf in localStorage; die blijft dus weg totdat er een nieuwe komt.
    async function refreshAnnouncements() {
      const { data } = await supabase
        .from("announcements")
        .select("id, message")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (!active) return;
      let dismissed = [];
      try {
        dismissed = JSON.parse(window.localStorage.getItem("collision-dismissed-announcements") || "[]");
      } catch {
        dismissed = [];
      }
      setAnnouncements((data || []).filter((a) => !dismissed.includes(a.id)));
    }

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("username, avatar_url").eq("id", user.id).single();
      if (!active) return;
      setUser(user);
      setProfile(data);

      // Bewaart (ververst) de sessie voor de snelle account-wisselknop
      // hieronder — puur dev-gemak, doet niets voor andere gebruikers dan
      // JorADMIN/Joram (zie lib/devAccountSwitch.js).
      if (isDevAccount(data?.username)) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (active && sessionData?.session) rememberDevSession(data.username, sessionData.session);
      }

      refreshPendingRequests(user.id);
      refreshAnnouncements();

      // Live bijwerken zodra de admin een melding plaatst, aan-/uitzet of
      // verwijdert, zonder dat je de pagina hoeft te verversen.
      announcementsChannel = supabase
        .channel("announcements-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, refreshAnnouncements)
        .subscribe();

      // Meldingsbolletje bij "Vrienden" — live bijgewerkt zodra er een
      // vriendverzoek binnenkomt, geaccepteerd of ingetrokken wordt.
      friendsChannel = supabase
        .channel(`friend-requests-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "friendships", filter: `addressee_id=eq.${user.id}` },
          () => refreshPendingRequests(user.id)
        )
        .subscribe();

      // Presence: elke ingelogde gebruiker met een app-pagina open telt als
      // "online". Puur socket-based, geen database-schrijfacties nodig.
      channel = supabase.channel("online-users", { config: { presence: { key: user.id } } });
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ username: data?.username, online_at: new Date().toISOString() });
        }
      });
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
      if (friendsChannel) supabase.removeChannel(friendsChannel);
      if (announcementsChannel) supabase.removeChannel(announcementsChannel);
    };
  }, []);

  function dismissAnnouncement(id) {
    setAnnouncements((list) => list.filter((a) => a.id !== id));
    try {
      const dismissed = JSON.parse(window.localStorage.getItem("collision-dismissed-announcements") || "[]");
      window.localStorage.setItem("collision-dismissed-announcements", JSON.stringify([...dismissed, id]));
    } catch {
      // localStorage kan geblokkeerd zijn (privémodus e.d.) — dan komt de
      // melding gewoon terug bij een volgend bezoek, geen harde fout waard.
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  function openFeedback() {
    setFeedbackText("");
    setFeedbackSent(false);
    setFeedbackError(null);
    setFeedbackOpen(true);
  }

  async function submitFeedback(e) {
    e.preventDefault();
    const message = feedbackText.trim();
    if (!message) return;
    setFeedbackSending(true);
    setFeedbackError(null);
    const { error } = await supabase.from("feedback").insert({ user_id: user.id, message });
    setFeedbackSending(false);
    if (error) { setFeedbackError(t("layout.feedback.error", { message: error.message })); return; }
    setFeedbackSent(true);
    setFeedbackText("");
  }

  const isAdmin = profile?.username === "JorADMIN";
  // De spelpagina heeft geen ruimte voor de vaste onderbalk — die zou
  // overlappen met haar eigen vaste actiebalk (STOP, hulpstuk plaatsen).
  // Daarom krijgt de kopbalk daar zelf de navigatie-tabs; op alle andere
  // pagina's blijft de onderbalk (was al goed zo) gewoon staan.
  const isGamePage = pathname.startsWith("/game/");

  return (
    <div className="app-shell">
      {/* Desktop-navigatie — op mobiel vervangen door de kopbalk hieronder. */}
      <nav className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <Logo size={20} />
          </div>
          {/* Zelfde account-menu als op mobiel (Profiel/Feedback/Admin/
              Uitloggen), hier rechtsboven bereikbaar via de avatar — op
              elke pagina, ook Admin. De taalknop staat niet meer hier, maar
              in de navigatielijst hieronder, naast Lobby/Vrienden/Uitleg. */}
          <button
            onClick={() => setAccountMenuOpen(true)}
            aria-label={t("layout.account.openMenu")}
            style={{ display: "flex", background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}
          >
            {profile && <Avatar username={profile.username} avatarUrl={profile.avatar_url} size={24} />}
          </button>
        </div>
        <div className="sidebar-body">
          <ul className="sidebar-nav">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`sidebar-link${pathname.startsWith(link.href) ? " active" : ""}`}
                >
                  <span style={{ position: "relative", display: "inline-flex" }}>
                    <link.icon size={17} strokeWidth={2} />
                    {link.href === "/friends" && pendingRequests > 0 && (
                      <span className="notif-dot">{pendingRequests > 9 ? "9+" : pendingRequests}</span>
                    )}
                  </span>
                  {t(link.labelKey)}
                </Link>
              </li>
            ))}
            <li>
              {/* Taalkeuze staat hier, naast Lobby/Vrienden/Uitleg, i.p.v.
                  los bovenin naast de avatar — zo is 'm meteen te vinden
                  tussen de rest van de navigatie. */}
              <button
                className="sidebar-link"
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                onClick={() => setLangMenuOpen(true)}
              >
                <Globe size={17} strokeWidth={2} />
                {t("layout.nav.language")}
              </button>
            </li>
            <li>
              {/* Themakeuze — zelfde plek/opzet als de taalkeuze hierboven. */}
              <button
                className="sidebar-link"
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                onClick={() => setThemeMenuOpen(true)}
              >
                <SunMoon size={17} strokeWidth={2} />
                {t("layout.nav.theme")}
              </button>
            </li>
            <li>
              <Link href="/profile" className={`sidebar-link${pathname.startsWith("/profile") ? " active" : ""}`}>
                <UserCircle size={17} strokeWidth={2} />
                {t("layout.nav.profile")}
              </Link>
            </li>
            <li>
              <button className="sidebar-link" style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }} onClick={openFeedback}>
                <MessageSquarePlus size={17} strokeWidth={2} />
                {t("layout.nav.feedback")}
              </button>
            </li>
            {isAdmin && (
              <li>
                <Link
                  href="/admin"
                  className={`sidebar-link${pathname.startsWith("/admin") ? " active" : ""}`}
                >
                  <ShieldCheck size={17} strokeWidth={2} />
                  {t("layout.nav.admin")}
                </Link>
              </li>
            )}
          </ul>
          <div className="sidebar-footer">
            {profile && (
              <span className="mono sidebar-username" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar username={profile.username} avatarUrl={profile.avatar_url} size={22} />
                {profile.username}
              </span>
            )}
            <button className="btn" onClick={signOut}>
              <LogOut size={15} strokeWidth={2} />
              {t("layout.nav.signOut")}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobiele kopbalk — branding + account-avatar. Op de spelpagina komen
          de navigatie-tabs er ook bij (zie isGamePage hierboven), want daar
          is geen ruimte voor de onderbalk. Op alle andere pagina's is de
          onderbalk (.bottom-nav) de plek voor navigatie — dat was al goed
          zo. */}
      <header className="mobile-topbar">
        <Logo size={16} />
        {isGamePage && (
          <div className="mobile-topbar-nav">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`mobile-topbar-tab${pathname.startsWith(link.href) ? " active" : ""}`}
                aria-label={t(link.labelKey)}
              >
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <link.icon size={19} strokeWidth={2} />
                  {link.href === "/friends" && pendingRequests > 0 && (
                    <span className="notif-dot">{pendingRequests > 9 ? "9+" : pendingRequests}</span>
                  )}
                </span>
              </Link>
            ))}
            {/* Zelfde taalknop als hieronder/op desktop, hier tussen de
                andere navigatie-tabs i.p.v. los bij de avatar — dit is de
                enige navigatiebalk die je op de spelpagina hebt. */}
            <button
              type="button"
              className="mobile-topbar-tab"
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              aria-label={t("layout.language.choose")}
              onClick={() => setLangMenuOpen(true)}
            >
              <Globe size={19} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="mobile-topbar-tab"
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              aria-label={t("layout.theme.choose")}
              onClick={() => setThemeMenuOpen(true)}
            >
              <SunMoon size={19} strokeWidth={2} />
            </button>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            className="mobile-topbar-avatar"
            onClick={() => setAccountMenuOpen(true)}
            aria-label={t("layout.account.openMenu")}
          >
            {profile && <Avatar username={profile.username} avatarUrl={profile.avatar_url} size={26} />}
          </button>
        </div>
      </header>

      <main className={`app-content${!isGamePage ? " app-content-with-bottom-nav" : ""}`}>
        {announcements.map((a) => (
          <div key={a.id} className="announcement-banner">
            <Megaphone size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span>{a.message}</span>
            <button className="announcement-banner-close" onClick={() => dismissAnnouncement(a.id)} aria-label={t("common.close")}>
              <X size={15} />
            </button>
          </div>
        ))}
        {children}
      </main>

      {/* Vaste onderbalk op mobiel, op alle pagina's behalve de spelpagina
          (zie isGamePage). Geen "Nieuwe partij"-knop meer (dubbelop met de
          Snel spelen-carrousel op de lobbypagina) en geen "Meer"-tab meer
          (dat zit nu achter de account-avatar in de kopbalk). */}
      {!isGamePage && (
        <nav className="bottom-nav">
          <div className="bottom-nav-tabs">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`bottom-nav-tab${pathname.startsWith(link.href) ? " active" : ""}`}
              >
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <link.icon size={19} strokeWidth={2} />
                  {link.href === "/friends" && pendingRequests > 0 && (
                    <span className="notif-dot">{pendingRequests > 9 ? "9+" : pendingRequests}</span>
                  )}
                </span>
                {t(link.labelKey)}
              </Link>
            ))}
            {/* Taalkeuze als vierde tab, naast Lobby/Vrienden/Uitleg —
                zelfde plek/stijl als op desktop, i.p.v. los bovenin. */}
            <button
              type="button"
              className="bottom-nav-tab"
              onClick={() => setLangMenuOpen(true)}
            >
              <Globe size={19} strokeWidth={2} />
              {t("layout.nav.language")}
            </button>
            <button
              type="button"
              className="bottom-nav-tab"
              onClick={() => setThemeMenuOpen(true)}
            >
              <SunMoon size={19} strokeWidth={2} />
              {t("layout.nav.theme")}
            </button>
          </div>
        </nav>
      )}

      {/* Centraal gepositioneerd (zoals de feedback-modal), i.p.v. rechtsboven
          verankerd — de knop die 'm opent zit nu tussen de navigatie-tabs
          (soms onderin, soms in de zijbalk), niet meer vast rechtsboven. */}
      {langMenuOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: "1rem",
          }}
          onClick={() => setLangMenuOpen(false)}
        >
          <div
            className="panel"
            style={{ width: "100%", maxWidth: 280, display: "flex", flexDirection: "column", gap: 4 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <h2 className="text-sm uppercase tracking-widest" style={{ color: "var(--accent)" }}>{t("layout.language.choose")}</h2>
              <button className="btn btn-icon" onClick={() => setLangMenuOpen(false)}><X size={16} /></button>
            </div>
            {SUPPORTED_LOCALES.map((code) => (
              <button
                key={code}
                className="sidebar-link"
                style={{
                  width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer",
                  color: code === locale ? "var(--accent)" : undefined, fontWeight: code === locale ? 600 : undefined,
                }}
                onClick={() => { setLocale(code); setLangMenuOpen(false); }}
              >
                {LOCALE_LABELS[code]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Zelfde gecentreerde modal-stijl als het taalmenu hierboven. */}
      {themeMenuOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: "1rem",
          }}
          onClick={() => setThemeMenuOpen(false)}
        >
          <div
            className="panel"
            style={{ width: "100%", maxWidth: 280, display: "flex", flexDirection: "column", gap: 4 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <h2 className="text-sm uppercase tracking-widest" style={{ color: "var(--accent)" }}>{t("layout.theme.choose")}</h2>
              <button className="btn btn-icon" onClick={() => setThemeMenuOpen(false)}><X size={16} /></button>
            </div>
            {SUPPORTED_THEMES.map((code) => (
              <button
                key={code}
                className="sidebar-link"
                style={{
                  width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer",
                  color: code === theme ? "var(--accent)" : undefined, fontWeight: code === theme ? 600 : undefined,
                }}
                onClick={() => { setTheme(code); setThemeMenuOpen(false); }}
              >
                {t(`theme.${code}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {accountMenuOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "flex-start", justifyContent: "flex-end", zIndex: 55,
          }}
          onClick={() => setAccountMenuOpen(false)}
        >
          <div
            className="panel"
            style={{ width: "100%", maxWidth: 280, margin: "8px 8px 0 0", display: "flex", flexDirection: "column", gap: 4 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              {profile && (
                <span className="mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <Avatar username={profile.username} avatarUrl={profile.avatar_url} size={24} />
                  {profile.username}
                </span>
              )}
              <button className="btn btn-icon" onClick={() => setAccountMenuOpen(false)}><X size={16} /></button>
            </div>
            <Link href="/profile" className="sidebar-link" onClick={() => setAccountMenuOpen(false)}>
              <UserCircle size={17} strokeWidth={2} />
              {t("layout.nav.profile")}
            </Link>
            <button className="sidebar-link" style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }} onClick={() => { setAccountMenuOpen(false); openFeedback(); }}>
              <MessageSquarePlus size={17} strokeWidth={2} />
              {t("layout.nav.feedback")}
            </button>
            {isAdmin && (
              <Link href="/admin" className="sidebar-link" onClick={() => setAccountMenuOpen(false)}>
                <ShieldCheck size={17} strokeWidth={2} />
                {t("layout.nav.admin")}
              </Link>
            )}
            <button className="sidebar-link" style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }} onClick={signOut}>
              <LogOut size={17} strokeWidth={2} />
              {t("layout.nav.signOut")}
            </button>
          </div>
        </div>
      )}

      {feedbackOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem",
          }}
        >
          <div className="panel" style={{ maxWidth: 400, width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm uppercase tracking-widest" style={{ color: "var(--accent)" }}>{t("layout.nav.feedback")}</h2>
              <button className="btn btn-icon" onClick={() => setFeedbackOpen(false)}><X size={16} /></button>
            </div>
            {feedbackSent ? (
              <p className="text-sm">{t("layout.feedback.thanks")}</p>
            ) : (
              <form onSubmit={submitFeedback} className="flex flex-col gap-3">
                <textarea
                  className="input"
                  rows={5}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder={t("layout.feedback.placeholder")}
                  autoFocus
                />
                {feedbackError && <p className="text-xs" style={{ color: "#e07a5f" }}>{feedbackError}</p>}
                <button className="btn btn-solid" type="submit" disabled={feedbackSending || !feedbackText.trim()}>
                  {feedbackSending ? t("layout.feedback.sending") : t("layout.feedback.send")}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
