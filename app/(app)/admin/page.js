"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, MessageSquare, Swords, Trash2, BookOpen, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Avatar, Badge, Rating } from "@/lib/ui";

// Beknopt overzicht: spelregel -> welke code/mechanic 'm afdwingt. Puur
// referentiemateriaal voor de admin, geen live data dus geen state nodig.
const RULES = [
  { rule: "Doel", detail: "Als eerste met je pion het centrumvakje bereiken.", mechanic: "isCenter(), state.winner" },
  { rule: "Stuiterbeweging", detail: "Een stuk schuift door tot het botst op een ander stuk, de bordrand, of (bij hulpstukken) het centrum.", mechanic: "slide()" },
  { rule: "Centrum betreden", detail: "Alleen pionnen mogen het centrum betreden en stoppen daar; hulpstukken stuiteren er net voor terug.", mechanic: "slide(..., isPawn)" },
  { rule: "Hulpstuk plaatsen", detail: "Elke speler heeft 5 hulpstukken; plaatsen op een leeg, niet-centrumvakje beëindigt de beurt meteen.", mechanic: "applyPlaceTool()" },
  { rule: "Beurt met meerdere stuiters", detail: "Eén zelfgekozen stuk (pion of eigen hulpstuk) mag binnen dezelfde beurt herhaaldelijk stuiteren, ook van richting wisselend, tot de speler stopt of vastloopt.", mechanic: "applyMove(), anyDirectionAvailable()" },
  { rule: "Insluitregel", detail: "Je beurt mag nooit eindigen op een positie die een pion (van jezelf of de tegenstander) volledig afsnijdt van het centrum — er doorheen bewegen (zonder daar te stoppen) mag wel.", mechanic: "bothPawnsCanReachCenter(), pawnCanReachCenter()" },
  { rule: "Terugkijken", detail: "Elke eerdere bordstaat wordt puur uit de zet-geschiedenis gereconstrueerd, niet apart opgeslagen.", mechanic: "reconstructBoard(), state.history" },
  { rule: "Computerspeler", detail: "4 niveaus: Makkelijk (willekeurig), Gemiddeld (1-ply heuristiek), Moeilijk/Expert (minimax + alfa-bèta, 2 resp. 3 zetten vooruit).", mechanic: "lib/collisionAI.js" },
  { rule: "Rating", detail: "Elo-systeem (start 1200) na elke afgeronde partij tussen twee échte spelers; K-factor 40/20/10 op basis van ervaring/rating.", mechanic: "apply_game_rating() (SQL)" },
];

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [users, setUsers] = useState([]);
  const [onlineIds, setOnlineIds] = useState(new Set());
  const [feedback, setFeedback] = useState([]);
  const [activeGames, setActiveGames] = useState([]);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    let channel;

    async function refreshAll() {
      const { data: userList, error: usersError } = await supabase
        .from("profiles")
        .select("id, username, rating, created_at")
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
        .select("id, status, created_at, a:player_a(username, rating), b:player_b(username, rating)")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (gamesError) setError("Partijen laden mislukt: " + gamesError.message);
      setActiveGames(games || []);
    }

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
        .on("postgres_changes", { event: "*", schema: "public", table: "feedback" }, refreshAll)
        .on("postgres_changes", { event: "*", schema: "public", table: "games" }, refreshAll)
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({ username: profile.username, online_at: new Date().toISOString() });
          }
        });
    }

    init();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [router]);

  async function deleteGame(gameId) {
    if (!window.confirm("Deze partij verwijderen?")) return;
    setError(null);
    setDeletingId(gameId);
    const { error } = await supabase.from("games").delete().eq("id", gameId);
    setDeletingId(null);
    if (error) setError("Verwijderen mislukt: " + error.message);
  }

  if (loading || !allowed) return <main className="min-h-screen flex items-center justify-center">Laden...</main>;

  return (
    <main className="min-h-screen px-4 py-10 max-w-3xl mx-auto flex flex-col gap-6">
      <h1 className="text-xl font-extrabold uppercase tracking-widest">Admin</h1>

      {error && <p className="text-sm" style={{ color: "#e07a5f" }}>{error}</p>}

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
          Gebruikers — {users.length} totaal, {onlineIds.size} online
        </h2>
        <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between text-sm">
              <span className="mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                <Avatar username={u.username} /> {u.username} <Rating value={u.rating} />
              </span>
              <Badge tone={onlineIds.has(u.id) ? "online" : "offline"}>
                {onlineIds.has(u.id) ? "online" : "offline"}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: "var(--accent)" }}>
          <MessageSquare size={15} /> Feedback
        </h2>
        {feedback.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Nog geen feedback ontvangen.</p>
        )}
        <ul className="flex flex-col gap-3 max-h-96 overflow-y-auto">
          {feedback.map((f) => (
            <li key={f.id} className="text-sm border-t pt-2" style={{ borderColor: "var(--panel-line)" }}>
              <div className="mono flex items-center gap-2" style={{ color: "var(--muted)", fontSize: "12px" }}>
                <Avatar username={f.profiles?.username} size={18} />
                {f.profiles?.username || "onbekend"} · {new Date(f.created_at).toLocaleString("nl-NL")}
              </div>
              <div>{f.message}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: "var(--accent)" }}>
          <Swords size={15} /> Actieve partijen — {activeGames.length}
        </h2>
        {activeGames.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Geen actieve partijen.</p>
        )}
        <ul className="flex flex-col gap-2">
          {activeGames.map((g) => (
            <li key={g.id} className="flex items-center justify-between text-sm">
              <span className="mono flex items-center gap-1" style={{ color: "var(--muted)" }}>
                <Avatar username={g.a?.username} size={22} /> {g.a?.username || "onbekend"} <Rating value={g.a?.rating} />
                <span style={{ margin: "0 4px" }}>vs</span>
                <Avatar username={g.b?.username} size={22} /> {g.b?.username || "onbekend"} <Rating value={g.b?.rating} />
              </span>
              <div className="flex items-center gap-2">
                <a className="btn" href={`/game/${g.id}`}><Eye size={14} /> Bekijk</a>
                <button className="btn btn-danger" onClick={() => deleteGame(g.id)} disabled={deletingId === g.id}>
                  <Trash2 size={14} /> {deletingId === g.id ? "Bezig..." : "Verwijderen"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <details>
          <summary
            className="summary-reset text-sm uppercase tracking-widest flex items-center gap-2"
            style={{ color: "var(--accent)" }}
          >
            <BookOpen size={15} /> Spelmechanica
            <ChevronRight size={15} className="details-chevron" />
          </summary>
          <ul className="flex flex-col gap-2 mt-3">
            {RULES.map((r) => (
              <li key={r.rule} className="text-xs" style={{ color: "var(--muted)" }}>
                <strong style={{ color: "var(--text)" }}>{r.rule}</strong> — {r.detail}{" "}
                <span className="mono" style={{ opacity: 0.75 }}>{r.mechanic}</span>
              </li>
            ))}
          </ul>
        </details>
      </section>
    </main>
  );
}
