"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, UserPlus, Check, Play, Trash2, MoreVertical, X, FolderOpen, Trophy, Skull, Cpu, TriangleAlert, Bug, Smartphone, ChevronRight, HelpCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { freshState } from "@/lib/collisionEngine";
import { DIFFICULTIES, DIFFICULTY_LABELS } from "@/lib/collisionAI";
import { BUGFIXES } from "@/lib/bugfixes";
import { Avatar, Badge, Rating, BoardLoader } from "@/lib/ui";

export default function LobbyPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [openGames, setOpenGames] = useState([]);
  const [invites, setInvites] = useState([]);
  const [myGames, setMyGames] = useState([]);
  const [archivedGames, setArchivedGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newGameStep, setNewGameStep] = useState(null); // null | "choose" | "invite" | "computer" | "local"
  const [localNameA, setLocalNameA] = useState("");
  const [localNameB, setLocalNameB] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [myRating, setMyRating] = useState(null);
  const [stats, setStats] = useState({ wins: 0, losses: 0 });
  const [consumedNewGameParam, setConsumedNewGameParam] = useState(false);

  useEffect(() => {
    let channel;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);

      await refreshGames(user.id);
      setLoading(false);

      channel = supabase
        .channel(`lobby-games-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "games" }, () => refreshGames(user.id))
        .subscribe();
    }

    init();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [router]);

  useEffect(() => {
    if (!openMenuId) return;
    function handleClick(e) {
      if (!e.target.closest?.(`[data-menu-id="${openMenuId}"]`)) setOpenMenuId(null);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [openMenuId]);

  // Alleen afgeronde partijen tussen twee echte spelers tellen mee (net als
  // bij de rating) — vier losse count-only queries, want requester/addressee
  // wisselen per rij en jsonb-filters op state->>winner laten zich niet in
  // één keer combineren met "welke kant was ik".
  async function refreshStats(userId) {
    const [aWin, bWin, aLoss, bLoss] = await Promise.all([
      supabase.from("games").select("id", { count: "exact", head: true }).eq("status", "finished").eq("vs_computer", false).eq("local_multiplayer", false).eq("player_a", userId).filter("state->>winner", "eq", "A"),
      supabase.from("games").select("id", { count: "exact", head: true }).eq("status", "finished").eq("vs_computer", false).eq("local_multiplayer", false).eq("player_b", userId).filter("state->>winner", "eq", "B"),
      supabase.from("games").select("id", { count: "exact", head: true }).eq("status", "finished").eq("vs_computer", false).eq("local_multiplayer", false).eq("player_a", userId).filter("state->>winner", "eq", "B"),
      supabase.from("games").select("id", { count: "exact", head: true }).eq("status", "finished").eq("vs_computer", false).eq("local_multiplayer", false).eq("player_b", userId).filter("state->>winner", "eq", "A"),
    ]);
    setStats({
      wins: (aWin.count || 0) + (bWin.count || 0),
      losses: (aLoss.count || 0) + (bLoss.count || 0),
    });
  }

  async function refreshGames(userId) {
    const { data: profile } = await supabase.from("profiles").select("rating").eq("id", userId).single();
    setMyRating(profile?.rating ?? null);
    refreshStats(userId);

    const { data: waiting } = await supabase
      .from("games")
      .select("id, player_a, status, created_at, profiles:player_a(username, rating)")
      .eq("status", "waiting")
      .is("invited_id", null)
      .neq("player_a", userId)
      .order("created_at", { ascending: false });
    setOpenGames(waiting || []);

    const { data: invited } = await supabase
      .from("games")
      .select("id, player_a, status, created_at, profiles:player_a(username, rating)")
      .eq("status", "waiting")
      .eq("invited_id", userId)
      .order("created_at", { ascending: false });
    setInvites(invited || []);

    const { data: mine } = await supabase
      .from("games")
      .select("id, status, player_a, player_b, invited_id, vs_computer, difficulty, local_multiplayer, local_name_b:state->localNames->>B, created_at, turn:state->>turn, a:player_a(username, rating), b:player_b(username, rating)")
      .or(`player_a.eq.${userId},player_b.eq.${userId}`)
      .neq("status", "finished")
      .order("created_at", { ascending: false });
    setMyGames(mine || []);

    await refreshArchive(userId);
  }

  async function refreshArchive(userId) {
    const { data: entries } = await supabase
      .from("archived_games")
      .select("id, game_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (!entries || entries.length === 0) { setArchivedGames([]); return; }

    const gameIds = entries.map((e) => e.game_id);
    const { data: games } = await supabase
      .from("games")
      .select("id, player_a, player_b, vs_computer, local_multiplayer, state, a:player_a(username, rating), b:player_b(username, rating)")
      .in("id", gameIds);
    const byId = Object.fromEntries((games || []).map((g) => [g.id, g]));

    setArchivedGames(entries.map((e) => ({ ...e, game: byId[e.game_id] })).filter((e) => e.game));
  }

  async function createGame(invitedId = null) {
    const { data, error } = await supabase
      .from("games")
      .insert({ player_a: user.id, invited_id: invitedId, status: "waiting", state: freshState() })
      .select()
      .single();
    if (!error) router.push(`/game/${data.id}`);
  }

  async function createComputerGame(difficulty) {
    const { data, error } = await supabase
      .from("games")
      .insert({ player_a: user.id, status: "active", vs_computer: true, difficulty, state: freshState() })
      .select()
      .single();
    if (!error) router.push(`/game/${data.id}`);
  }

  // "Pass-and-play" op één apparaat: player_b blijft leeg (net als bij
  // vs_computer) — jouw account bestuurt om beurten beide kanten. De namen
  // van beide kanten leven in state.localNames i.p.v. een aparte kolom.
  async function createLocalGame() {
    const state = freshState();
    state.localNames = {
      A: localNameA.trim() || "Speler 1",
      B: localNameB.trim() || "Speler 2",
    };
    const { data, error } = await supabase
      .from("games")
      .insert({ player_a: user.id, status: "active", local_multiplayer: true, state })
      .select()
      .single();
    if (!error) router.push(`/game/${data.id}`);
  }

  function closeNewGameModal() {
    setNewGameStep(null);
    setSearchQuery("");
    setSearchResults([]);
    setLocalNameA("");
    setLocalNameB("");
  }

  async function searchUsers(e) {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, username")
      .ilike("username", `%${query}%`)
      .neq("id", user.id)
      .limit(8);
    setSearchResults(data || []);
    setSearching(false);
  }

  async function joinGame(gameId) {
    setJoinError(null);
    setJoiningId(gameId);
    const { data, error } = await supabase
      .from("games")
      .update({ player_b: user.id, status: "active" })
      .eq("id", gameId)
      .eq("status", "waiting")
      .select()
      .single();
    setJoiningId(null);
    if (error || !data) {
      setJoinError("Iemand anders was je net voor — deze partij is niet meer beschikbaar.");
      await refreshGames(user.id);
      return;
    }
    router.push(`/game/${gameId}`);
  }

  async function deleteGame(gameId) {
    if (!window.confirm("Deze partij verwijderen?")) return;
    setDeleteError(null);
    setDeletingId(gameId);
    const { error } = await supabase.from("games").delete().eq("id", gameId);
    setDeletingId(null);
    if (error) {
      setDeleteError("Verwijderen mislukt: " + error.message);
      return;
    }
    await refreshGames(user.id);
  }

  // Bepaalt of jij nu iets moet doen in deze partij — bij lokaal
  // pass-and-play speel je altijd allebei de kanten, dus die staat
  // hierbinnen altijd aan jouw kant, ongeacht wiens pion er nu aan zet is.
  function needsMyAction(g) {
    if (g.status !== "active") return false;
    if (g.local_multiplayer) return true;
    const myRoleInGame = g.player_a === user.id ? "A" : "B";
    return g.turn === myRoleInGame;
  }

  // Gedeeld tussen de "Jouw beurt"- en "Tegenstander aan zet"-lijst hieronder.
  function renderMyGameRow(g) {
    const opponentName = g.vs_computer
      ? "Computer"
      : g.local_multiplayer
        ? (g.local_name_b || "Speler 2")
        : (g.player_a === user.id ? g.b?.username : g.a?.username);
    const opponentRating = (g.vs_computer || g.local_multiplayer) ? null : (g.player_a === user.id ? g.b?.rating : g.a?.rating);
    const canDelete = g.status === "waiting" && g.player_a === user.id;
    return (
      <li
        key={g.id}
        className="flex items-center justify-between text-sm"
        style={{ cursor: "pointer" }}
        onClick={() => router.push(`/game/${g.id}`)}
      >
        <span className="mono flex items-center gap-2 flex-wrap" style={{ color: "var(--muted)" }}>
          <Avatar username={opponentName} />
          {opponentName ? `Partij met ${opponentName}` : "Partij"} <Rating value={opponentRating} />
          {g.status === "waiting" && <Badge tone="waiting">wacht op tegenstander</Badge>}
          {g.vs_computer ? (
            <Badge tone="warning"><Cpu size={12} /> {DIFFICULTY_LABELS[g.difficulty] || "computer"} (bèta)</Badge>
          ) : g.local_multiplayer ? (
            <Badge tone="neutral"><Smartphone size={12} /> lokaal</Badge>
          ) : null}
        </span>
        {canDelete && (
          <div data-menu-id={g.id} style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-icon" onClick={() => setOpenMenuId(openMenuId === g.id ? null : g.id)}>
              <MoreVertical size={16} />
            </button>
            {openMenuId === g.id && (
              <div
                className="panel"
                style={{
                  position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 20,
                  padding: 8, display: "flex", flexDirection: "column", gap: 4, minWidth: 150,
                }}
              >
                <button className="btn btn-danger" onClick={() => { setOpenMenuId(null); deleteGame(g.id); }} disabled={deletingId === g.id}>
                  <Trash2 size={14} /> {deletingId === g.id ? "Bezig..." : "Verwijderen"}
                </button>
              </div>
            )}
          </div>
        )}
      </li>
    );
  }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><BoardLoader /></main>;

  // De "Nieuwe partij"-knop in de vaste mobiele onderbalk (layout.js) is
  // overal in de app zichtbaar en stuurt hierheen met ?newGame=1, zodat 'm
  // direct de kiezer opent i.p.v. eerst alleen naar de lobby te navigeren.
  if (!consumedNewGameParam && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("newGame") === "1") {
    setConsumedNewGameParam(true);
    setNewGameStep("choose");
    window.history.replaceState(null, "", "/lobby");
  }

  const myTurnGames = myGames.filter(needsMyAction);
  const theirTurnGames = myGames.filter((g) => !needsMyAction(g));

  return (
    <main className="min-h-screen px-4 py-10 max-w-2xl mx-auto flex flex-col gap-6">
      {newGameStep && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem",
          }}
        >
          <div className="panel" style={{ maxWidth: 360, width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm uppercase tracking-widest" style={{ color: "var(--accent)" }}>Nieuwe partij</h2>
              <button className="btn btn-icon" onClick={closeNewGameModal}><X size={16} /></button>
            </div>

            {newGameStep === "choose" && (
              <div className="flex flex-col gap-2">
                <button className="btn btn-solid" onClick={() => createGame()}>
                  <Play size={15} /> Open partij starten
                </button>
                <button className="btn" onClick={() => setNewGameStep("invite")}>
                  <UserPlus size={15} /> Speler uitnodigen
                </button>
                <button className="btn" onClick={() => setNewGameStep("computer")}>
                  <Cpu size={15} /> Tegen de computer
                </button>
                <button className="btn" onClick={() => setNewGameStep("local")}>
                  <Smartphone size={15} /> Lokaal (1 apparaat)
                </button>
              </div>
            )}

            {newGameStep === "local" && (
              <div className="flex flex-col gap-3">
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Speel om beurten tegen elkaar op dit toestel — handig als je samen op de bank zit. Niks wordt gedeeld met een ander account.
                </p>
                <div className="flex flex-col gap-2">
                  <label className="text-xs mono" style={{ color: "var(--muted)" }}>Naam speler 1 (bruin)</label>
                  <input
                    type="text"
                    value={localNameA}
                    onChange={(e) => setLocalNameA(e.target.value)}
                    placeholder="Speler 1"
                    className="input"
                    maxLength={30}
                    autoFocus
                  />
                  <label className="text-xs mono" style={{ color: "var(--muted)" }}>Naam speler 2 (wit)</label>
                  <input
                    type="text"
                    value={localNameB}
                    onChange={(e) => setLocalNameB(e.target.value)}
                    placeholder="Speler 2"
                    className="input"
                    maxLength={30}
                  />
                </div>
                <button className="btn btn-solid" onClick={createLocalGame}>
                  <Smartphone size={15} /> Start lokale partij
                </button>
              </div>
            )}

            {newGameStep === "computer" && (
              <div className="flex flex-col gap-2">
                <p
                  className="text-xs flex items-center gap-2"
                  style={{ color: "#e0b24c", background: "rgba(224, 178, 76, 0.12)", border: "1px solid rgba(224, 178, 76, 0.3)", borderRadius: 8, padding: "6px 10px" }}
                >
                  <TriangleAlert size={14} strokeWidth={2} />
                  Bèta: de computerspeler is nog in ontwikkeling en speelt niet altijd goed of foutloos.
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>Kies een moeilijkheidsgraad:</p>
                {DIFFICULTIES.map((difficulty) => (
                  <button key={difficulty} className="btn" onClick={() => createComputerGame(difficulty)}>
                    <Cpu size={15} /> {DIFFICULTY_LABELS[difficulty]}
                  </button>
                ))}
              </div>
            )}

            {newGameStep === "invite" && (
              <div className="flex flex-col gap-3">
                <form onSubmit={searchUsers} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Zoek op gebruikersnaam..."
                    className="input flex-1"
                    autoFocus
                  />
                  <button className="btn btn-icon" type="submit" disabled={searching}><Search size={15} /></button>
                </form>
                {searchResults.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {searchResults.map((p) => (
                      <li key={p.id} className="flex items-center justify-between text-sm">
                        <span className="mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                          <Avatar username={p.username} />
                          {p.username}
                        </span>
                        <button className="btn" onClick={() => createGame(p.id)}>
                          <UserPlus size={15} /> Uitnodigen
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold uppercase tracking-widest flex items-center gap-2">
          Lobby
          {myRating != null && (
            <span className="text-xs mono" style={{ color: "var(--muted)", fontWeight: 400, textTransform: "none", letterSpacing: "normal" }}>
              jouw rating: {myRating}
            </span>
          )}
        </h1>
        <button className="btn btn-solid" onClick={() => setNewGameStep("choose")}>
          <Plus size={16} /> Nieuwe partij
        </button>
      </div>

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
          Snel spelen
        </h2>
        <div className="carousel">
          <button className="carousel-card" onClick={() => setNewGameStep("invite")}>
            <span className="carousel-card-icon" style={{ background: "rgba(143, 180, 214, 0.18)", color: "#8fb4d6" }}>
              <UserPlus size={18} />
            </span>
            <span>
              <span className="carousel-card-title">Vriend uitnodigen</span>
              <span className="carousel-card-sub">Speel 1-op-1</span>
            </span>
          </button>
          <button className="carousel-card" onClick={() => setNewGameStep("computer")}>
            <span className="carousel-card-icon" style={{ background: "rgba(224, 178, 76, 0.18)", color: "#e0b24c" }}>
              <Cpu size={18} />
            </span>
            <span>
              <span className="carousel-card-title">Tegen de computer</span>
              <span className="carousel-card-sub">4 niveaus</span>
            </span>
          </button>
          <button className="carousel-card" onClick={() => setNewGameStep("local")}>
            <span className="carousel-card-icon" style={{ background: "var(--panel-line)", color: "var(--text)" }}>
              <Smartphone size={18} />
            </span>
            <span>
              <span className="carousel-card-title">Lokaal spelen</span>
              <span className="carousel-card-sub">Samen op de bank</span>
            </span>
          </button>
          <button className="carousel-card" onClick={() => createGame()}>
            <span className="carousel-card-icon" style={{ background: "rgba(157, 185, 138, 0.18)", color: "#9db98a" }}>
              <Play size={18} />
            </span>
            <span>
              <span className="carousel-card-title">Open partij</span>
              <span className="carousel-card-sub">Iedereen mag joinen</span>
            </span>
          </button>
          <button className="carousel-card" onClick={() => router.push("/tutorial")}>
            <span className="carousel-card-icon" style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
              <HelpCircle size={18} />
            </span>
            <span>
              <span className="carousel-card-title">Uitleg</span>
              <span className="carousel-card-sub">Leer de regels</span>
            </span>
          </button>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
          Statistieken
        </h2>
        <div className="carousel">
          <div className="stat-card">
            <span className="stat-card-value">{myRating ?? "—"}</span>
            <span className="stat-card-label">Rating</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value">{myGames.length}</span>
            <span className="stat-card-label">Actief</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value" style={{ color: "#9db98a" }}>{stats.wins}</span>
            <span className="stat-card-label">Gewonnen</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value" style={{ color: "#e07a5f" }}>{stats.losses}</span>
            <span className="stat-card-label">Verloren</span>
          </div>
        </div>
      </section>

      {joinError && <p className="text-sm" style={{ color: "#e07a5f" }}>{joinError}</p>}
      {deleteError && <p className="text-sm" style={{ color: "#e07a5f" }}>{deleteError}</p>}

      {invites.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            Uitnodigingen voor jou
          </h2>
          <ul className="flex flex-col gap-2">
            {invites.map((g) => (
              <li key={g.id} className="flex items-center justify-between text-sm">
                <span className="mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                  <Avatar username={g.profiles?.username} />
                  {g.profiles?.username || "onbekend"} <Rating value={g.profiles?.rating} /> nodigt je uit
                </span>
                <button className="btn btn-success" onClick={() => joinGame(g.id)} disabled={joiningId === g.id}>
                  <Check size={15} /> {joiningId === g.id ? "Bezig..." : "Accepteren"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {myTurnGames.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            Jouw beurt
          </h2>
          <ul className="flex flex-col gap-2">
            {myTurnGames.map((g) => renderMyGameRow(g))}
          </ul>
        </section>
      )}

      {theirTurnGames.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            Tegenstander aan zet
          </h2>
          <ul className="flex flex-col gap-2">
            {theirTurnGames.map((g) => renderMyGameRow(g))}
          </ul>
        </section>
      )}

      {archivedGames.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            Gearchiveerde partijen
          </h2>
          <ul className="flex flex-col gap-2">
            {archivedGames.map((e) => {
              const g = e.game;
              const opponentName = g.vs_computer
                ? "Computer"
                : g.local_multiplayer
                  ? (g.state?.localNames?.B || "Speler 2")
                  : (g.player_a === user.id ? g.b?.username : g.a?.username);
              const opponentRating = (g.vs_computer || g.local_multiplayer) ? null : (g.player_a === user.id ? g.b?.rating : g.a?.rating);
              const myRole = g.player_a === user.id ? "A" : "B";
              const won = g.state?.winner === myRole;
              const winnerName = g.local_multiplayer
                ? (g.state?.localNames?.[g.state?.winner] || `Speler ${g.state?.winner}`)
                : null;
              return (
                <li key={e.id} className="flex items-center justify-between text-sm">
                  <span className="mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                    <Avatar username={opponentName} />
                    Partij met {opponentName || "onbekend"} <Rating value={opponentRating} />
                    <Badge tone={g.local_multiplayer || won ? "active" : "closed"}>
                      {g.local_multiplayer || won ? <Trophy size={12} /> : <Skull size={12} />} {g.local_multiplayer ? `${winnerName} won` : (won ? "gewonnen" : "verloren")}
                    </Badge>
                  </span>
                  <a className="btn" href={`/game/${g.id}`}><FolderOpen size={14} /> Bekijk</a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {openGames.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            Open partijen
          </h2>
          <ul className="flex flex-col gap-2">
            {openGames.map((g) => (
              <li key={g.id} className="flex items-center justify-between text-sm">
                <span className="mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                  <Avatar username={g.profiles?.username} />
                  {g.profiles?.username || "onbekend"} <Rating value={g.profiles?.rating} /> wacht op een tegenstander
                </span>
                <button className="btn btn-success" onClick={() => joinGame(g.id)} disabled={joiningId === g.id}>
                  <Play size={15} /> {joiningId === g.id ? "Bezig..." : "Meespelen"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <details>
          <summary
            className="summary-reset text-sm uppercase tracking-widest flex items-center gap-2"
            style={{ color: "var(--accent)" }}
          >
            <Bug size={15} /> Opgeloste bugs
            <ChevronRight size={15} className="details-chevron" />
          </summary>
          <ul className="flex flex-col gap-3 mt-3">
            {BUGFIXES.map((fix, i) => (
              <li key={i} className="text-sm border-t pt-2" style={{ borderColor: "var(--panel-line)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <strong>{fix.title}</strong>
                  {fix.date && <span className="text-xs mono" style={{ color: "var(--muted)" }}>{fix.date}</span>}
                </div>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{fix.detail}</p>
              </li>
            ))}
          </ul>
        </details>
      </section>
    </main>
  );
}
