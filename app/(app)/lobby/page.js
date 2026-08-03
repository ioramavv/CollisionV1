"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, UserPlus, Check, Play, Trash2, MoreVertical, X, FolderOpen, Trophy, Skull, Cpu } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { freshState } from "@/lib/collisionEngine";
import { Avatar, Badge } from "@/lib/ui";

export default function LobbyPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [openGames, setOpenGames] = useState([]);
  const [invites, setInvites] = useState([]);
  const [myGames, setMyGames] = useState([]);
  const [archivedGames, setArchivedGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newGameStep, setNewGameStep] = useState(null); // null | "choose" | "invite"
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);

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

  async function refreshGames(userId) {
    const { data: waiting } = await supabase
      .from("games")
      .select("id, player_a, status, created_at, profiles:player_a(username)")
      .eq("status", "waiting")
      .is("invited_id", null)
      .neq("player_a", userId)
      .order("created_at", { ascending: false });
    setOpenGames(waiting || []);

    const { data: invited } = await supabase
      .from("games")
      .select("id, player_a, status, created_at, profiles:player_a(username)")
      .eq("status", "waiting")
      .eq("invited_id", userId)
      .order("created_at", { ascending: false });
    setInvites(invited || []);

    const { data: mine } = await supabase
      .from("games")
      .select("id, status, player_a, player_b, invited_id, vs_computer, created_at, turn:state->>turn, a:player_a(username), b:player_b(username)")
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
      .select("id, player_a, player_b, vs_computer, state, a:player_a(username), b:player_b(username)")
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

  async function createComputerGame() {
    const { data, error } = await supabase
      .from("games")
      .insert({ player_a: user.id, status: "active", vs_computer: true, state: freshState() })
      .select()
      .single();
    if (!error) router.push(`/game/${data.id}`);
  }

  function closeNewGameModal() {
    setNewGameStep(null);
    setSearchQuery("");
    setSearchResults([]);
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

  if (loading) return <main className="min-h-screen flex items-center justify-center">Laden...</main>;

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
                <button className="btn" onClick={createComputerGame}>
                  <Cpu size={15} /> Tegen de computer
                </button>
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
        <h1 className="text-xl font-extrabold uppercase tracking-widest">Lobby</h1>
        <button className="btn btn-solid" onClick={() => setNewGameStep("choose")}>
          <Plus size={16} /> Nieuwe partij
        </button>
      </div>

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
                  {g.profiles?.username || "onbekend"} nodigt je uit
                </span>
                <button className="btn btn-success" onClick={() => joinGame(g.id)} disabled={joiningId === g.id}>
                  <Check size={15} /> {joiningId === g.id ? "Bezig..." : "Accepteren"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {myGames.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            Jouw partijen
          </h2>
          <ul className="flex flex-col gap-2">
            {myGames.map((g) => {
              const opponentName = g.vs_computer ? "Computer" : (g.player_a === user.id ? g.b?.username : g.a?.username);
              const canDelete = g.status === "waiting" && g.player_a === user.id;
              const myRoleInGame = g.player_a === user.id ? "A" : "B";
              const isMyTurn = g.status === "active" && g.turn === myRoleInGame;
              return (
                <li
                  key={g.id}
                  className="flex items-center justify-between text-sm"
                  style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/game/${g.id}`)}
                >
                  <span className="mono flex items-center gap-2 flex-wrap" style={{ color: "var(--muted)" }}>
                    <Avatar username={opponentName} />
                    {opponentName ? `Partij met ${opponentName}` : "Partij"}
                    <Badge tone={g.status === "waiting" ? "waiting" : "active"}>
                      {g.status === "waiting" ? "wacht op tegenstander" : "actief"}
                    </Badge>
                    {g.vs_computer ? (
                      <Badge tone="neutral"><Cpu size={12} /> computer</Badge>
                    ) : (
                      <Badge tone={g.invited_id ? "closed" : "open"}>
                        {g.invited_id ? "gesloten match" : "open match"}
                      </Badge>
                    )}
                    {isMyTurn && <Badge tone="turn">Jouw beurt!</Badge>}
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
            })}
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
              const opponentName = g.vs_computer ? "Computer" : (g.player_a === user.id ? g.b?.username : g.a?.username);
              const myRole = g.player_a === user.id ? "A" : "B";
              const won = g.state?.winner === myRole;
              return (
                <li key={e.id} className="flex items-center justify-between text-sm">
                  <span className="mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                    <Avatar username={opponentName} />
                    Partij met {opponentName || "onbekend"}
                    <Badge tone={won ? "active" : "closed"}>
                      {won ? <Trophy size={12} /> : <Skull size={12} />} {won ? "gewonnen" : "verloren"}
                    </Badge>
                  </span>
                  <a className="btn" href={`/game/${g.id}`}><FolderOpen size={14} /> Bekijk</a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
          Open partijen
        </h2>
        {openGames.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Geen open partijen — maak er zelf een aan.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {openGames.map((g) => (
            <li key={g.id} className="flex items-center justify-between text-sm">
              <span className="mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                <Avatar username={g.profiles?.username} />
                {g.profiles?.username || "onbekend"} wacht op een tegenstander
              </span>
              <button className="btn btn-success" onClick={() => joinGame(g.id)} disabled={joiningId === g.id}>
                <Play size={15} /> {joiningId === g.id ? "Bezig..." : "Meespelen"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
