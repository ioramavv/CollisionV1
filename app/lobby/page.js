"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { freshState } from "@/lib/collisionEngine";

export default function LobbyPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [openGames, setOpenGames] = useState([]);
  const [invites, setInvites] = useState([]);
  const [myGames, setMyGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [joinError, setJoinError] = useState(null);

  useEffect(() => {
    let channel;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);

      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(prof);

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
      .select("id, status, player_a, player_b, created_at")
      .or(`player_a.eq.${userId},player_b.eq.${userId}`)
      .neq("status", "finished")
      .order("created_at", { ascending: false });
    setMyGames(mine || []);
  }

  async function createGame(invitedId = null) {
    const { data, error } = await supabase
      .from("games")
      .insert({ player_a: user.id, invited_id: invitedId, status: "waiting", state: freshState() })
      .select()
      .single();
    if (!error) router.push(`/game/${data.id}`);
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

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) return <main className="min-h-screen flex items-center justify-center">Laden...</main>;

  return (
    <main className="min-h-screen px-4 py-10 max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold uppercase tracking-widest">Lobby</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm mono" style={{ color: "var(--muted)" }}>
            {profile?.username}
          </span>
          <button className="btn" onClick={signOut}>Uitloggen</button>
        </div>
      </div>

      <button className="btn btn-solid w-fit" onClick={() => createGame()}>+ Nieuwe partij</button>

      {joinError && <p className="text-sm" style={{ color: "#e07a5f" }}>{joinError}</p>}

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--gold)" }}>
          Speler uitnodigen
        </h2>
        <form onSubmit={searchUsers} className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Zoek op gebruikersnaam..."
            className="input flex-1"
          />
          <button className="btn" type="submit" disabled={searching}>Zoeken</button>
        </form>
        {searchResults.length > 0 && (
          <ul className="flex flex-col gap-2 mt-3">
            {searchResults.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span className="mono" style={{ color: "var(--muted)" }}>{p.username}</span>
                <button className="btn" onClick={() => createGame(p.id)}>Uitnodigen</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {invites.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--gold)" }}>
            Uitnodigingen voor jou
          </h2>
          <ul className="flex flex-col gap-2">
            {invites.map((g) => (
              <li key={g.id} className="flex items-center justify-between text-sm">
                <span className="mono" style={{ color: "var(--muted)" }}>
                  {g.profiles?.username || "onbekend"} nodigt je uit
                </span>
                <button className="btn" onClick={() => joinGame(g.id)} disabled={joiningId === g.id}>
                  {joiningId === g.id ? "Bezig..." : "Accepteren"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {myGames.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--gold)" }}>
            Jouw partijen
          </h2>
          <ul className="flex flex-col gap-2">
            {myGames.map((g) => (
              <li key={g.id} className="flex items-center justify-between text-sm">
                <span className="mono" style={{ color: "var(--muted)" }}>
                  Partij {g.id.slice(0, 8)} · {g.status === "waiting" ? "wacht op tegenstander" : "actief"}
                </span>
                <a className="btn" href={`/game/${g.id}`}>Openen</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--gold)" }}>
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
              <span className="mono" style={{ color: "var(--muted)" }}>
                {g.profiles?.username || "onbekend"} wacht op een tegenstander
              </span>
              <button className="btn" onClick={() => joinGame(g.id)} disabled={joiningId === g.id}>
                {joiningId === g.id ? "Bezig..." : "Meespelen"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
