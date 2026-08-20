"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, UserPlus, Check, Play, Trash2, MoreVertical, X, FolderOpen, Trophy, Skull, Cpu, TriangleAlert, Bug, Smartphone, ChevronRight, HelpCircle, ArrowLeftRight, Archive, Eye } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { freshState } from "@/lib/collisionEngine";
import { Pawn, PieceGradients } from "@/lib/Board";
import { Avatar, Badge, Rating, BoardLoader } from "@/lib/ui";
import LobbyTour from "@/lib/LobbyTour";
import { getDevSession } from "@/lib/devAccountSwitch";
import { useSiteContent, DEFAULT_CONTENT } from "@/lib/siteContent";
import { useTranslation, useLocale } from "@/lib/i18n";

export default function LobbyPage() {
  const router = useRouter();
  const tI18n = useTranslation();
  const [locale] = useLocale();
  const siteT = useSiteContent();
  // site_content (het admin-tekst-CMS, zie lib/siteContent.js) dekt maar een
  // handvol keys (sectietitels/kaarten) en is altijd Nederlands — die
  // override geldt dus alleen als de site-taal ook Nederlands is; voor elke
  // andere taal (en voor alle keys die site_content niet kent) gebruiken we
  // gewoon de vertaalde tekst uit lib/i18n.
  function t(key, params) {
    if (locale === "nl" && key in DEFAULT_CONTENT) return siteT(key);
    return tI18n(key, params);
  }

  const [user, setUser] = useState(null);
  const [openGames, setOpenGames] = useState([]);
  const [invites, setInvites] = useState([]);
  const [myGames, setMyGames] = useState([]);
  const [finishedGames, setFinishedGames] = useState([]);
  const [finishedActionId, setFinishedActionId] = useState(null);
  const [finishedActionError, setFinishedActionError] = useState(null);
  const [archivedGames, setArchivedGames] = useState([]);
  const [bugfixes, setBugfixes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newGameStep, setNewGameStep] = useState(null); // null | "invite" | "computer" | "local"
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
  const [myUsername, setMyUsername] = useState(null);
  const [stats, setStats] = useState({ wins: 0, losses: 0 });
  const [friendsList, setFriendsList] = useState([]);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  // Opnieuw starten vanaf het account-menu terwijl je al op de lobby staat
  // (dan verandert de route niet, dus de ?tour=1-check in init() hieronder
  // draait niet opnieuw) — zie de "collision-start-tour"-event in
  // app/(app)/layout.js, dat gebruikt wordt zodra je al hier bent.
  useEffect(() => {
    function handler() { setTourOpen(true); }
    window.addEventListener("collision-start-tour", handler);
    return () => window.removeEventListener("collision-start-tour", handler);
  }, []);

  function finishTour() {
    setTourOpen(false);
    try {
      if (user) window.localStorage.setItem(`collision-tour-seen:${user.id}`, "1");
    } catch { /* privémodus e.d. — dan komt de rondleiding gewoon terug bij een volgend bezoek */ }
  }

  useEffect(() => {
    let channel;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);

      await refreshGames(user.id);
      await refreshBugfixes();
      setLoading(false);

      // Rondleiding: automatisch bij een account dat 'm op dit apparaat nog
      // nooit gezien heeft (nieuw account, meestal een nieuwe browser dus
      // ook een lege localStorage), of expliciet opgevraagd via
      // "Rondleiding" in het account-menu (?tour=1, zie
      // app/(app)/layout.js). Pas ná setLoading(false) checken, want de
      // rondleiding wijst naar echte knoppen op de pagina die pas bestaan
      // zodra het laadscherm weg is.
      const seenKey = `collision-tour-seen:${user.id}`;
      let alreadySeen = false;
      try { alreadySeen = window.localStorage.getItem(seenKey) === "1"; } catch { /* privémodus e.d. */ }
      if (new URLSearchParams(window.location.search).get("tour") === "1") {
        router.replace("/lobby");
        setTourOpen(true);
      } else if (!alreadySeen) {
        setTourOpen(true);
      }

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

  // Voor de "Vriend uitnodigen"-stap: je eigen vriendenlijst, zodat je
  // meteen kunt aantikken i.p.v. eerst een gebruikersnaam te moeten typen.
  async function refreshFriendsList(userId) {
    const { data } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, requester:requester_id(id, username, rating), addressee:addressee_id(id, username, rating)")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    const rows = (data || [])
      .map((r) => (r.requester_id === userId ? r.addressee : r.requester))
      .filter(Boolean);
    setFriendsList(rows);
  }

  async function refreshGames(userId) {
    const { data: profile } = await supabase.from("profiles").select("rating, username").eq("id", userId).single();
    setMyRating(profile?.rating ?? null);
    setMyUsername(profile?.username ?? null);
    refreshStats(userId);
    refreshFriendsList(userId);

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

    await Promise.all([refreshFinishedGames(userId), refreshArchive(userId)]);
  }

  // Partijen die net zijn afgelopen (bv. de tegenstander deed de winnende
  // zet terwijl jij niet op de spelpagina was) — die verdwijnen anders
  // spoorloos uit "Jouw beurt"/"Tegenstander aan zet". Blijven hier zichtbaar
  // tot je 'm archiveert of negeert (zie archiveFinished/dismissFinished).
  async function refreshFinishedGames(userId) {
    const [{ data: finished }, { data: archivedRows }, { data: dismissedRows }] = await Promise.all([
      supabase
        .from("games")
        .select("id, status, player_a, player_b, vs_computer, local_multiplayer, state, updated_at, a:player_a(username, rating), b:player_b(username, rating)")
        .or(`player_a.eq.${userId},player_b.eq.${userId}`)
        .eq("status", "finished")
        .order("updated_at", { ascending: false }),
      supabase.from("archived_games").select("game_id").eq("user_id", userId),
      supabase.from("dismissed_games").select("game_id").eq("user_id", userId),
    ]);
    const archivedIds = new Set((archivedRows || []).map((r) => r.game_id));
    const dismissedIds = new Set((dismissedRows || []).map((r) => r.game_id));
    setFinishedGames((finished || []).filter((g) => !archivedIds.has(g.id) && !dismissedIds.has(g.id)));
  }

  async function archiveFinished(gameId) {
    setFinishedActionError(null);
    setFinishedActionId(gameId);
    const { error } = await supabase.from("archived_games").insert({ user_id: user.id, game_id: gameId });
    setFinishedActionId(null);
    if (error && error.code !== "23505") {
      setFinishedActionError(t("lobby.error.archiveFailed", { message: error.message }));
      return;
    }
    setFinishedGames((games) => games.filter((g) => g.id !== gameId));
    refreshArchive(user.id);
  }

  async function dismissFinished(gameId) {
    setFinishedActionError(null);
    setFinishedActionId(gameId);
    const { error } = await supabase.from("dismissed_games").insert({ user_id: user.id, game_id: gameId });
    setFinishedActionId(null);
    if (error && error.code !== "23505") {
      setFinishedActionError(t("lobby.error.dismissFailed", { message: error.message }));
      return;
    }
    setFinishedGames((games) => games.filter((g) => g.id !== gameId));
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

  // Opgeloste bugs (zie adminpagina voor het beheer) — alleen bevestigde
  // entries zijn hier zichtbaar (RLS filtert dit ook af, maar de query hoeft
  // dan geen onbevestigde concepten op te halen).
  async function refreshBugfixes() {
    const { data } = await supabase
      .from("bugfixes")
      .select("id, title, detail, created_at")
      .eq("confirmed", true)
      .order("created_at", { ascending: false });
    setBugfixes(data || []);
  }

  // Dev-gemak: direct wisselen naar het "JorADMIN"-account, zonder uit te
  // loggen. Vereist dat er ooit al eens (op dit apparaat) met dat account
  // is ingelogd — pas dan staat de sessie klaar (zie lib/devAccountSwitch.js).
  async function switchToJorADMIN() {
    const session = getDevSession("JorADMIN");
    if (!session) return;
    setSwitchingAccount(true);
    const { error } = await supabase.auth.setSession(session);
    if (error) {
      setSwitchingAccount(false);
      return;
    }
    window.location.reload();
  }

  async function createGame(invitedId = null) {
    const { data, error } = await supabase
      .from("games")
      .insert({ player_a: user.id, invited_id: invitedId, status: "waiting", state: freshState() })
      .select()
      .single();
    if (!error) router.push(`/game/${data.id}`);
  }

  // De moeilijkheidsgraad-keuze is uit de lobby gehaald — nieuwe partijen
  // tegen de computer gebruiken altijd 'expert'. In plaats daarvan kiest de
  // speler hier welke pionkleur (dus welke kant) ze zelf spelen; de
  // computer bestuurt de andere kant (games.computer_side, zie schema.sql).
  async function createComputerGame(humanSide) {
    const computerSide = humanSide === "A" ? "B" : "A";
    const { data, error } = await supabase
      .from("games")
      .insert({ player_a: user.id, status: "active", vs_computer: true, difficulty: "expert", computer_side: computerSide, state: freshState() })
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
      A: localNameA.trim() || t("lobby.modal.local.player1Placeholder"),
      B: localNameB.trim() || t("lobby.modal.local.player2Placeholder"),
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
      setJoinError(t("lobby.error.gameTaken"));
      await refreshGames(user.id);
      return;
    }
    router.push(`/game/${gameId}`);
  }

  async function deleteGame(gameId) {
    if (!window.confirm(t("lobby.confirm.deleteGame"))) return;
    setDeleteError(null);
    setDeletingId(gameId);
    const { error } = await supabase.from("games").delete().eq("id", gameId);
    setDeletingId(null);
    if (error) {
      setDeleteError(t("lobby.error.deleteFailed", { message: error.message }));
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
        ? (g.local_name_b || t("lobby.modal.local.player2Placeholder"))
        : (g.player_a === user.id ? g.b?.username : g.a?.username);
    const opponentRating = (g.vs_computer || g.local_multiplayer) ? null : (g.player_a === user.id ? g.b?.rating : g.a?.rating);
    const canDelete = g.status === "waiting" && g.player_a === user.id;
    return (
      <li
        key={g.id}
        className="clickable-row flex items-center justify-between text-sm"
        onClick={() => router.push(`/game/${g.id}`)}
      >
        <span className="mono flex items-center gap-2 flex-wrap" style={{ color: "var(--muted)" }}>
          <Avatar username={opponentName} />
          {opponentName ? t("lobby.game.withOpponent", { name: opponentName }) : t("lobby.game.generic")} <Rating value={opponentRating} />
          {g.status === "waiting" && <Badge tone="waiting">{t("lobby.badge.waitingForOpponent")}</Badge>}
          {g.vs_computer ? (
            <Badge tone="warning"><Cpu size={12} /> {t(`lobby.difficulty.${g.difficulty}`)} {t("common.beta")}</Badge>
          ) : g.local_multiplayer ? (
            <Badge tone="neutral"><Smartphone size={12} /> {t("lobby.badge.local")}</Badge>
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
                  <Trash2 size={14} /> {deletingId === g.id ? t("common.busy") : t("common.delete")}
                </button>
              </div>
            )}
          </div>
        )}
      </li>
    );
  }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><BoardLoader /></main>;

  const myTurnGames = myGames.filter(needsMyAction);
  const theirTurnGames = myGames.filter((g) => !needsMyAction(g));

  return (
    <main className="min-h-screen px-4 py-10 max-w-2xl mx-auto flex flex-col gap-6">
      <LobbyTour open={tourOpen} onFinish={finishTour} />
      {newGameStep && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem",
          }}
        >
          <div className="panel" style={{ maxWidth: 360, width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm uppercase tracking-widest" style={{ color: "var(--accent)" }}>{t("lobby.modal.title")}</h2>
              <button className="btn btn-icon" onClick={closeNewGameModal}><X size={16} /></button>
            </div>

            {newGameStep === "local" && (
              <div className="flex flex-col gap-3">
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {t("lobby.modal.local.intro")}
                </p>
                <div className="flex flex-col gap-2">
                  <label className="text-xs mono" style={{ color: "var(--muted)" }}>{t("lobby.modal.local.player1Label")}</label>
                  <input
                    type="text"
                    value={localNameA}
                    onChange={(e) => setLocalNameA(e.target.value)}
                    placeholder={t("lobby.modal.local.player1Placeholder")}
                    className="input"
                    maxLength={30}
                    autoFocus
                  />
                  <label className="text-xs mono" style={{ color: "var(--muted)" }}>{t("lobby.modal.local.player2Label")}</label>
                  <input
                    type="text"
                    value={localNameB}
                    onChange={(e) => setLocalNameB(e.target.value)}
                    placeholder={t("lobby.modal.local.player2Placeholder")}
                    className="input"
                    maxLength={30}
                  />
                </div>
                <button className="btn btn-solid" onClick={createLocalGame}>
                  <Smartphone size={15} /> {t("lobby.modal.local.start")}
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
                  {t("lobby.modal.computer.betaWarning")}
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{t("lobby.modal.computer.chooseSide")}</p>
                <PieceGradients />
                <div className="flex items-stretch gap-2">
                  <button
                    className="btn"
                    style={{ flex: 1, flexDirection: "column", padding: "18px 10px" }}
                    onClick={() => createComputerGame("A")}
                    aria-label={t("lobby.modal.computer.playAsA")}
                  >
                    <span style={{ width: 44 }}><Pawn owner="A" /></span>
                  </button>
                  <button
                    className="btn"
                    style={{ flex: 1, flexDirection: "column", padding: "18px 10px" }}
                    onClick={() => createComputerGame("B")}
                    aria-label={t("lobby.modal.computer.playAsB")}
                  >
                    <span style={{ width: 44 }}><Pawn owner="B" /></span>
                  </button>
                </div>
              </div>
            )}

            {newGameStep === "invite" && (
              <div className="flex flex-col gap-3">
                {friendsList.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs mono" style={{ color: "var(--muted)" }}>{t("lobby.modal.invite.yourFriends")}</p>
                    <ul className="flex flex-col gap-2" style={{ maxHeight: 220, overflowY: "auto" }}>
                      {friendsList.map((f) => (
                        <li key={f.id} className="flex items-center justify-between text-sm">
                          <span className="mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                            <Avatar username={f.username} />
                            {f.username} <Rating value={f.rating} />
                          </span>
                          <button className="btn" onClick={() => createGame(f.id)}>
                            <UserPlus size={15} /> {t("lobby.modal.invite.invite")}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs mono" style={{ color: "var(--muted)" }}>{t("lobby.modal.invite.orSearch")}</p>
                  </div>
                )}
                <form onSubmit={searchUsers} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("lobby.modal.invite.searchPlaceholder")}
                    className="input flex-1"
                    autoFocus={friendsList.length === 0}
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
                          <UserPlus size={15} /> {t("lobby.modal.invite.invite")}
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

      {/* Dev-gemak: alleen zichtbaar voor het "Joram"-testaccount. Altijd
          aanwezig (uitgeschakeld met uitleg zolang er nog geen bewaarde
          sessie voor JorADMIN is — dan moet daar eerst één keer mee
          ingelogd worden). */}
      {myUsername === "Joram" && (
        <div className="flex items-center justify-between">
          <button
            className="btn"
            onClick={switchToJorADMIN}
            disabled={switchingAccount || !getDevSession("JorADMIN")}
            title={!getDevSession("JorADMIN") ? t("lobby.devSwitch.tooltip", { target: "JorADMIN" }) : undefined}
          >
            <ArrowLeftRight size={15} /> {switchingAccount ? t("common.busy") : t("lobby.devSwitch.switchTo", { target: "JorADMIN" })}
          </button>
        </div>
      )}

      {joinError && <p className="text-sm" style={{ color: "#e07a5f" }}>{joinError}</p>}
      {deleteError && <p className="text-sm" style={{ color: "#e07a5f" }}>{deleteError}</p>}

      {invites.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            {t("lobby.section.invites")}
          </h2>
          <ul className="flex flex-col gap-2">
            {invites.map((g) => (
              <li key={g.id} className="flex items-center justify-between text-sm">
                <span className="mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                  <Avatar username={g.profiles?.username} />
                  {t("lobby.invite.from", { name: g.profiles?.username || t("common.unknown") })} <Rating value={g.profiles?.rating} />
                </span>
                <button className="btn btn-success" onClick={() => joinGame(g.id)} disabled={joiningId === g.id}>
                  <Check size={15} /> {joiningId === g.id ? t("common.busy") : t("common.accept")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {myTurnGames.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            {t("lobby.section.myTurn")}
          </h2>
          <ul className="flex flex-col gap-2">
            {myTurnGames.map((g) => renderMyGameRow(g))}
          </ul>
        </section>
      )}

      {theirTurnGames.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            {t("lobby.section.theirTurn")}
          </h2>
          <ul className="flex flex-col gap-2">
            {theirTurnGames.map((g) => renderMyGameRow(g))}
          </ul>
        </section>
      )}

      <section className="panel" data-tour="quickplay">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
          {t("lobby.section.quickPlay")}
        </h2>
        <div className="carousel">
          <button className="carousel-card" onClick={() => setNewGameStep("invite")}>
            <span className="carousel-card-icon" style={{ background: "rgba(143, 180, 214, 0.18)", color: "#8fb4d6" }}>
              <UserPlus size={18} />
            </span>
            <span>
              <span className="carousel-card-title">{t("lobby.card.invite.title")}</span>
              <span className="carousel-card-sub">{t("lobby.card.invite.sub")}</span>
            </span>
          </button>
          <button className="carousel-card" onClick={() => setNewGameStep("computer")}>
            <span className="carousel-card-icon" style={{ background: "rgba(224, 178, 76, 0.18)", color: "#e0b24c" }}>
              <Cpu size={18} />
            </span>
            <span>
              <span className="carousel-card-title">{t("lobby.card.computer.title")}</span>
              <span className="carousel-card-sub">{t("lobby.card.computer.sub")}</span>
            </span>
          </button>
          <button className="carousel-card" onClick={() => setNewGameStep("local")}>
            <span className="carousel-card-icon" style={{ background: "var(--panel-line)", color: "var(--text)" }}>
              <Smartphone size={18} />
            </span>
            <span>
              <span className="carousel-card-title">{t("lobby.card.local.title")}</span>
              <span className="carousel-card-sub">{t("lobby.card.local.sub")}</span>
            </span>
          </button>
          <button className="carousel-card" onClick={() => createGame()}>
            <span className="carousel-card-icon" style={{ background: "rgba(157, 185, 138, 0.18)", color: "#9db98a" }}>
              <Play size={18} />
            </span>
            <span>
              <span className="carousel-card-title">{t("lobby.card.open.title")}</span>
              <span className="carousel-card-sub">{t("lobby.card.open.sub")}</span>
            </span>
          </button>
          <button className="carousel-card" data-tour="tutorial-card" onClick={() => router.push("/tutorial")}>
            <span className="carousel-card-icon" style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
              <HelpCircle size={18} />
            </span>
            <span>
              <span className="carousel-card-title">{t("lobby.card.tutorial.title")}</span>
              <span className="carousel-card-sub">{t("lobby.card.tutorial.sub")}</span>
            </span>
          </button>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
          {t("lobby.section.stats")}
        </h2>
        <div className="carousel">
          <div className="stat-card">
            <span className="stat-card-value">{myRating ?? "—"}</span>
            <span className="stat-card-label">{t("lobby.stats.rating")}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value">{myGames.length}</span>
            <span className="stat-card-label">{t("lobby.stats.active")}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value" style={{ color: "#9db98a" }}>{stats.wins}</span>
            <span className="stat-card-label">{t("lobby.stats.won")}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value" style={{ color: "#e07a5f" }}>{stats.losses}</span>
            <span className="stat-card-label">{t("lobby.stats.lost")}</span>
          </div>
        </div>
      </section>

      {/* Partijen die net zijn afgelopen — bv. de tegenstander deed de
          winnende zet terwijl jij niet op de spelpagina was. Blijven hier
          zichtbaar (met de winnende zet nog te bekijken via de partij zelf)
          tot je ze archiveert of negeert, zodat ze niet spoorloos uit
          "Jouw beurt"/"Tegenstander aan zet" verdwijnen. */}
      {finishedGames.length > 0 && (
        <section className="panel">
          <details>
            <summary className="summary-reset text-sm uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--accent)" }}>
              {t("lobby.section.finished")} — {finishedGames.length}
              <ChevronRight size={15} className="details-chevron" />
            </summary>
            {finishedActionError && <p className="text-xs mb-2 mt-3" style={{ color: "#e07a5f" }}>{finishedActionError}</p>}
            <ul className="flex flex-col gap-2 mt-3">
              {finishedGames.map((g) => {
                const opponentName = g.vs_computer
                  ? "Computer"
                  : g.local_multiplayer
                    ? (g.state?.localNames?.B || t("lobby.modal.local.player2Placeholder"))
                    : (g.player_a === user.id ? g.b?.username : g.a?.username);
                const opponentRating = (g.vs_computer || g.local_multiplayer) ? null : (g.player_a === user.id ? g.b?.rating : g.a?.rating);
                const myRole = g.player_a === user.id ? "A" : "B";
                const won = g.state?.winner === myRole;
                const winnerName = g.local_multiplayer
                  ? (g.state?.localNames?.[g.state?.winner] || `${t("lobby.modal.local.player1Placeholder")}/${t("lobby.modal.local.player2Placeholder")}`)
                  : null;
                const busy = finishedActionId === g.id;
                return (
                  <li
                    key={g.id}
                    className="clickable-row flex items-center justify-between text-sm"
                    onClick={() => router.push(`/game/${g.id}`)}
                  >
                    <span className="mono flex items-center gap-2 flex-wrap" style={{ color: "var(--muted)" }}>
                      <Avatar username={opponentName} />
                      {t("lobby.game.withOpponent", { name: opponentName || t("common.unknown") })} <Rating value={opponentRating} />
                      <Badge tone={g.local_multiplayer || won ? "active" : "closed"}>
                        {g.local_multiplayer || won ? <Trophy size={12} /> : <Skull size={12} />} {g.local_multiplayer ? t("lobby.badge.wonBy", { name: winnerName }) : (won ? t("lobby.badge.won") : t("lobby.badge.lost"))}
                      </Badge>
                    </span>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-icon" title={t("lobby.actions.viewGame")} onClick={() => router.push(`/game/${g.id}`)}>
                        <Eye size={14} />
                      </button>
                      <button className="btn btn-icon" title={t("lobby.actions.archive")} onClick={() => archiveFinished(g.id)} disabled={busy}>
                        <Archive size={14} />
                      </button>
                      <button className="btn btn-icon" title={t("lobby.actions.ignore")} onClick={() => dismissFinished(g.id)} disabled={busy}>
                        <X size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </details>
        </section>
      )}

      {archivedGames.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            {t("lobby.section.archived")}
          </h2>
          <ul className="flex flex-col gap-2">
            {archivedGames.map((e) => {
              const g = e.game;
              const opponentName = g.vs_computer
                ? "Computer"
                : g.local_multiplayer
                  ? (g.state?.localNames?.B || t("lobby.modal.local.player2Placeholder"))
                  : (g.player_a === user.id ? g.b?.username : g.a?.username);
              const opponentRating = (g.vs_computer || g.local_multiplayer) ? null : (g.player_a === user.id ? g.b?.rating : g.a?.rating);
              const myRole = g.player_a === user.id ? "A" : "B";
              const won = g.state?.winner === myRole;
              const winnerName = g.local_multiplayer
                ? (g.state?.localNames?.[g.state?.winner] || `${t("lobby.modal.local.player1Placeholder")}/${t("lobby.modal.local.player2Placeholder")}`)
                : null;
              return (
                <li key={e.id} className="flex items-center justify-between text-sm">
                  <span className="mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                    <Avatar username={opponentName} />
                    {t("lobby.game.withOpponent", { name: opponentName || t("common.unknown") })} <Rating value={opponentRating} />
                    <Badge tone={g.local_multiplayer || won ? "active" : "closed"}>
                      {g.local_multiplayer || won ? <Trophy size={12} /> : <Skull size={12} />} {g.local_multiplayer ? t("lobby.badge.wonBy", { name: winnerName }) : (won ? t("lobby.badge.won") : t("lobby.badge.lost"))}
                    </Badge>
                  </span>
                  <a className="btn" href={`/game/${g.id}`}><FolderOpen size={14} /> {t("common.view")}</a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {openGames.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            {t("lobby.section.open")}
          </h2>
          <ul className="flex flex-col gap-2">
            {openGames.map((g) => (
              <li key={g.id} className="flex items-center justify-between text-sm">
                <span className="mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                  <Avatar username={g.profiles?.username} />
                  {t("lobby.openGame.waiting", { name: g.profiles?.username || t("common.unknown") })} <Rating value={g.profiles?.rating} />
                </span>
                <button className="btn btn-success" onClick={() => joinGame(g.id)} disabled={joiningId === g.id}>
                  <Play size={15} /> {joiningId === g.id ? t("common.busy") : t("lobby.actions.join")}
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
            <Bug size={15} /> {t("lobby.bugfixes.title")}
            <ChevronRight size={15} className="details-chevron" />
          </summary>
          <ul className="flex flex-col gap-3 mt-3">
            {bugfixes.map((fix) => (
              <li key={fix.id} className="text-sm border-t pt-2" style={{ borderColor: "var(--panel-line)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <strong>{fix.title?.[locale] || fix.title?.nl}</strong>
                  <span className="text-xs mono" style={{ color: "var(--muted)" }}>
                    {new Date(fix.created_at).toISOString().slice(0, 10)}
                  </span>
                </div>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{fix.detail?.[locale] || fix.detail?.nl}</p>
              </li>
            ))}
          </ul>
        </details>
      </section>
    </main>
  );
}
