"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Swords, Users, MessageSquarePlus, ShieldCheck, LogOut, X, Menu, HelpCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Avatar, Logo } from "@/lib/ui";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  // Sluit het mobiele menu automatisch zodra er (client-side) genavigeerd
  // wordt, zodat het niet openstaat blijft na het kiezen van een link.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
  }

  useEffect(() => {
    let active = true;
    let channel;
    let friendsChannel;

    async function refreshPendingRequests(userId) {
      const { count } = await supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("addressee_id", userId)
        .eq("status", "pending");
      if (active) setPendingRequests(count || 0);
    }

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("username").eq("id", user.id).single();
      if (!active) return;
      setUser(user);
      setProfile(data);

      refreshPendingRequests(user.id);

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
    };
  }, []);

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

  return (
    <div className="app-shell">
      <nav className={`sidebar${mobileMenuOpen ? " open" : ""}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <Logo size={20} />
          </div>
          <button
            className="btn btn-icon sidebar-toggle"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label={mobileMenuOpen ? "Menu sluiten" : "Menu openen"}
            style={{ position: "relative" }}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            {!mobileMenuOpen && pendingRequests > 0 && (
              <span className="notif-dot">{pendingRequests > 9 ? "9+" : pendingRequests}</span>
            )}
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
                <Avatar username={profile.username} size={22} />
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
      <main className="app-content">{children}</main>

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
