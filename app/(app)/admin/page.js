"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [users, setUsers] = useState([]);
  const [onlineIds, setOnlineIds] = useState(new Set());
  const [feedback, setFeedback] = useState([]);
  const [activeGames, setActiveGames] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let channel;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
      if (profile?.username !== "JorADMIN") {
        router.push("/lobby");
        return;
      }
      setAllowed(true);

      await refreshAll();
      setLoading(false);

      channel = supabase.channel("online-users", { config: { presence: { key: user.id } } });
      channel
        .on("presence", { event: "sync" }, () => {
          setOnlineIds(new Set(Object.keys(channel.presenceState())));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({ username: profile.username, online_at: new Date().toISOString() });
          }
        });
    }

    async function refreshAll() {
      const { data: userList, error: usersError } = await supabase
        .from("profiles")
        .select("id, username, created_at")
        .order("created_at", { ascending: false });
      if (usersError) setError("Gebruikers laden mislukt: " + usersError.message);
      setUsers(userList || []);

      const { data: feedbackList, error: feedbackError } = await supabase
        .from("feedback")
        .select("id, message, created_at, profiles:user_id(username)")
        .order("created_at", { ascending: false });
      if (feedbackError) setError("Feedback laden mislukt: " + feedbackError.message);
      setFeedback(feedbackList || []);

      const { data: games, error: gamesError } = await supabase
        .from("games")
        .select("id, status, created_at, a:player_a(username), b:player_b(username)")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (gamesError) setError("Partijen laden mislukt: " + gamesError.message);
      setActiveGames(games || []);
    }

    init();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [router]);

  if (loading || !allowed) return <main className="min-h-screen flex items-center justify-center">Laden...</main>;

  return (
    <main className="min-h-screen px-4 py-10 max-w-3xl mx-auto flex flex-col gap-6">
      <h1 className="text-xl font-extrabold uppercase tracking-widest">Admin</h1>

      {error && <p className="text-sm" style={{ color: "#e07a5f" }}>{error}</p>}

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--gold)" }}>
          Gebruikers — {users.length} totaal, {onlineIds.size} online
        </h2>
        <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between text-sm">
              <span className="mono" style={{ color: "var(--muted)" }}>{u.username}</span>
              <span
                className="mono"
                style={{ color: onlineIds.has(u.id) ? "var(--gold)" : "var(--muted)", fontSize: "12px" }}
              >
                {onlineIds.has(u.id) ? "● online" : "○ offline"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--gold)" }}>
          Feedback
        </h2>
        {feedback.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Nog geen feedback ontvangen.</p>
        )}
        <ul className="flex flex-col gap-3 max-h-96 overflow-y-auto">
          {feedback.map((f) => (
            <li key={f.id} className="text-sm border-t pt-2" style={{ borderColor: "var(--panel-line)" }}>
              <div className="mono" style={{ color: "var(--muted)", fontSize: "12px" }}>
                {f.profiles?.username || "onbekend"} · {new Date(f.created_at).toLocaleString("nl-NL")}
              </div>
              <div>{f.message}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--gold)" }}>
          Actieve partijen — {activeGames.length}
        </h2>
        {activeGames.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Geen actieve partijen.</p>
        )}
        <ul className="flex flex-col gap-2">
          {activeGames.map((g) => (
            <li key={g.id} className="flex items-center justify-between text-sm">
              <span className="mono" style={{ color: "var(--muted)" }}>
                {g.a?.username || "onbekend"} vs {g.b?.username || "onbekend"}
              </span>
              <a className="btn" href={`/game/${g.id}`}>Bekijk</a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
