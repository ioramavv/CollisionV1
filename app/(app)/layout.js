"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Swords, Users, MessageSquarePlus, ShieldCheck, LogOut, X, HelpCircle, UserCircle, Megaphone } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Avatar, Logo } from "@/lib/ui";
import { rememberDevSession, isDevAccount } from "@/lib/devAccountSwitch";

const LINKS = [
  { href: "/lobby", label: "Lobby", icon: Swords },
  { href: "/friends", label: "Vrienden", icon: Users },
  { href: "/tutorial", label: "Uitleg", icon: HelpCircle },
];

export default function AppLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [announcements, setAnnouncements] = useState([]);
  // Sluit het account-menu automatisch zodra er (client-side) genavigeerd
  // wordt, zodat het niet openstaat blijft na het kiezen van een link.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setAccountMenuOpen(false);
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
    if (error) { setFeedbackError("Versturen mislukt: " + error.message); return; }
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
              Uitloggen), ook hier rechtsboven bereikbaar via de avatar —
              op elke pagina, ook Admin. */}
          <button
            onClick={() => setAccountMenuOpen(true)}
            aria-label="Account-menu openen"
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
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/profile" className={`sidebar-link${pathname.startsWith("/profile") ? " active" : ""}`}>
                <UserCircle size={17} strokeWidth={2} />
                Profiel
              </Link>
            </li>
            <li>
              <button className="sidebar-link" style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }} onClick={openFeedback}>
                <MessageSquarePlus size={17} strokeWidth={2} />
                Feedback
              </button>
            </li>
            {isAdmin && (
              <li>
                <Link
                  href="/admin"
                  className={`sidebar-link${pathname.startsWith("/admin") ? " active" : ""}`}
                >
                  <ShieldCheck size={17} strokeWidth={2} />
                  Admin
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
              Uitloggen
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
                aria-label={link.label}
              >
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <link.icon size={19} strokeWidth={2} />
                  {link.href === "/friends" && pendingRequests > 0 && (
                    <span className="notif-dot">{pendingRequests > 9 ? "9+" : pendingRequests}</span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
        <button
          className="mobile-topbar-avatar"
          onClick={() => setAccountMenuOpen(true)}
          aria-label="Account-menu openen"
        >
          {profile && <Avatar username={profile.username} avatarUrl={profile.avatar_url} size={26} />}
        </button>
      </header>

      <main className={`app-content${!isGamePage ? " app-content-with-bottom-nav" : ""}`}>
        {announcements.map((a) => (
          <div key={a.id} className="announcement-banner">
            <Megaphone size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span>{a.message}</span>
            <button className="announcement-banner-close" onClick={() => dismissAnnouncement(a.id)} aria-label="Melding sluiten">
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
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
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
              Profiel
            </Link>
            <button className="sidebar-link" style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }} onClick={() => { setAccountMenuOpen(false); openFeedback(); }}>
              <MessageSquarePlus size={17} strokeWidth={2} />
              Feedback
            </button>
            {isAdmin && (
              <Link href="/admin" className="sidebar-link" onClick={() => setAccountMenuOpen(false)}>
                <ShieldCheck size={17} strokeWidth={2} />
                Admin
              </Link>
            )}
            <button className="sidebar-link" style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }} onClick={signOut}>
              <LogOut size={17} strokeWidth={2} />
              Uitloggen
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
              <h2 className="text-sm uppercase tracking-widest" style={{ color: "var(--accent)" }}>Feedback</h2>
              <button className="btn btn-icon" onClick={() => setFeedbackOpen(false)}><X size={16} /></button>
            </div>
            {feedbackSent ? (
              <p className="text-sm">Bedankt voor je feedback!</p>
            ) : (
              <form onSubmit={submitFeedback} className="flex flex-col gap-3">
                <textarea
                  className="input"
                  rows={5}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Wat wil je laten weten?"
                  autoFocus
                />
                {feedbackError && <p className="text-xs" style={{ color: "#e07a5f" }}>{feedbackError}</p>}
                <button className="btn btn-solid" type="submit" disabled={feedbackSending || !feedbackText.trim()}>
                  {feedbackSending ? "Versturen..." : "Versturen"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
