"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const LINKS = [
  { href: "/lobby", label: "Lobby" },
  { href: "/friends", label: "Vrienden" },
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

  useEffect(() => {
    let active = true;
    let channel;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("username").eq("id", user.id).single();
      if (!active) return;
      setUser(user);
      setProfile(data);

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
      <nav className="sidebar">
        <div className="sidebar-brand">
          Colli<span style={{ color: "var(--gold)" }}>sion</span>
        </div>
        <ul className="sidebar-nav">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`sidebar-link${pathname.startsWith(link.href) ? " active" : ""}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <button className="sidebar-link" style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }} onClick={openFeedback}>
              Feedback
            </button>
          </li>
          {isAdmin && (
            <li>
              <Link
                href="/admin"
                className={`sidebar-link${pathname.startsWith("/admin") ? " active" : ""}`}
              >
                Admin
              </Link>
            </li>
          )}
        </ul>
        <div className="sidebar-footer">
          {profile && <span className="mono sidebar-username">{profile.username}</span>}
          <button className="btn" onClick={signOut}>Uitloggen</button>
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
              <h2 className="text-sm uppercase tracking-widest" style={{ color: "var(--gold)" }}>Feedback</h2>
              <button className="btn" onClick={() => setFeedbackOpen(false)}>×</button>
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
