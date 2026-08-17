"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Eye, MessageSquare, Swords, Trash2, BookOpen, ChevronRight, ChevronDown, ArrowLeftRight,
  Search, Pencil, Check, X, Megaphone, Send, Clock, Trophy, FileEdit, Bug, ListTodo, Wrench,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Avatar, Badge, Rating, BoardLoader } from "@/lib/ui";
import { getDevSession } from "@/lib/devAccountSwitch";

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
  { rule: "Computerspeler", detail: "4 niveaus: Makkelijk (willekeurig uit een opgeschoonde kandidatenlijst), Gemiddeld/Moeilijk/Expert (minimax + alfa-bèta, iterative deepening binnen een tijdsbudget van 200/500/1000ms) — plaatst hulpstukken alleen met aantoonbaar effect en vermijdt zinloze pion-terugzetten.", mechanic: "lib/collisionAI.js" },
  { rule: "Rating", detail: "Elo-systeem (start 1200) na elke afgeronde partij tussen twee échte spelers; K-factor 40/20/10 op basis van ervaring/rating.", mechanic: "apply_game_rating() (SQL)" },
];

// Naam van de tegenstander in een partij, ongeacht of het een echte
// speler, de computer of een lokale tweede speler is — gedeeld door de
// diverse partijlijsten hieronder.
function opponentNameFor(g, role) {
  if (g.vs_computer) return "Computer";
  if (g.local_multiplayer) return g.state?.localNames?.[role === "A" ? "B" : "A"] || `Speler ${role === "A" ? "B" : "A"}`;
  return role === "A" ? g.b?.username : g.a?.username;
}

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [adminId, setAdminId] = useState(null);
  const [users, setUsers] = useState([]);
  const [onlineIds, setOnlineIds] = useState(new Set());
  const [feedback, setFeedback] = useState([]);
  const [activeGames, setActiveGames] = useState([]);
  const [waitingGames, setWaitingGames] = useState([]);
  const [finishedGames, setFinishedGames] = useState([]);
  const [gameCounts, setGameCounts] = useState({ total: 0, today: 0 });
  const [announcements, setAnnouncements] = useState([]);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);

  const [userSearch, setUserSearch] = useState("");
  const [sortMode, setSortMode] = useState("recent"); // recent | rating
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [expandedUserLoading, setExpandedUserLoading] = useState(false);
  const [expandedUserGames, setExpandedUserGames] = useState([]);
  const [expandedUserFriends, setExpandedUserFriends] = useState([]);

  const [editingRatingId, setEditingRatingId] = useState(null);
  const [ratingInput, setRatingInput] = useState("");
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingError, setRatingError] = useState(null);

  const [announcementText, setAnnouncementText] = useState("");
  const [announcementPosting, setAnnouncementPosting] = useState(false);
  const [announcementError, setAnnouncementError] = useState(null);

  const [bugfixes, setBugfixes] = useState([]);
  const [bugfixTitleInput, setBugfixTitleInput] = useState("");
  const [bugfixDetailInput, setBugfixDetailInput] = useState("");
  const [bugfixPosting, setBugfixPosting] = useState(false);
  const [bugfixError, setBugfixError] = useState(null);

  useEffect(() => {
    let channel;

    async function refreshAll() {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const [
        { data: userList, error: usersError },
        { data: feedbackList, error: feedbackError },
        { data: active, error: activeError },
        { data: waiting, error: waitingError },
        { data: finished, error: finishedError },
        { count: totalCount },
        { count: todayCount },
        { data: announcementList, error: announcementListError },
        { data: bugfixList, error: bugfixListError },
      ] = await Promise.all([
        supabase.from("profiles").select("id, username, rating, created_at").order("created_at", { ascending: false }),
        supabase.from("feedback").select("id, user_id, message, created_at, profiles:user_id(username)").order("created_at", { ascending: false }),
        supabase
          .from("games")
          .select("id, status, created_at, a:player_a(username, rating), b:player_b(username, rating)")
          .eq("status", "active")
          .order("created_at", { ascending: false }),
        supabase
          .from("games")
          .select("id, status, created_at, invited_id, a:player_a(username, rating), invited:invited_id(username)")
          .eq("status", "waiting")
          .order("created_at", { ascending: false }),
        supabase
          .from("games")
          .select("id, status, created_at, updated_at, vs_computer, local_multiplayer, state, a:player_a(username, rating), b:player_b(username, rating)")
          .eq("status", "finished")
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase.from("games").select("id", { count: "exact", head: true }),
        supabase.from("games").select("id", { count: "exact", head: true }).gte("created_at", startOfToday.toISOString()),
        supabase.from("announcements").select("*").order("created_at", { ascending: false }),
        supabase.from("bugfixes").select("*").order("created_at", { ascending: false }),
      ]);

      const firstError = usersError || feedbackError || activeError || waitingError || finishedError || announcementListError || bugfixListError;
      if (firstError) setError("Laden mislukt: " + firstError.message);

      setUsers(userList || []);
      setFeedback(feedbackList || []);
      setActiveGames(active || []);
      setWaitingGames(waiting || []);
      setFinishedGames(finished || []);
      setGameCounts({ total: totalCount || 0, today: todayCount || 0 });
      setAnnouncements(announcementList || []);
      setBugfixes(bugfixList || []);
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
      setAdminId(user.id);

      await refreshAll();
      setLoading(false);

      channel = supabase.channel("online-users", { config: { presence: { key: user.id } } });
      channel
        .on("presence", { event: "sync" }, () => {
          setOnlineIds(new Set(Object.keys(channel.presenceState())));
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "feedback" }, refreshAll)
        .on("postgres_changes", { event: "*", schema: "public", table: "games" }, refreshAll)
        .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, refreshAll)
        .on("postgres_changes", { event: "*", schema: "public", table: "bugfixes" }, refreshAll)
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({ username: profile.username, online_at: new Date().toISOString() });
          }
        });
    }

    init();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [router]);

  // Dev-gemak: direct wisselen naar het "Joram"-testaccount, zonder uit te
  // loggen. Vereist dat er ooit al eens (op dit apparaat) met dat account
  // is ingelogd — pas dan staat de sessie klaar (zie lib/devAccountSwitch.js).
  async function switchToJoram() {
    const session = getDevSession("Joram");
    if (!session) return;
    setSwitchingAccount(true);
    const { error } = await supabase.auth.setSession(session);
    if (error) {
      setSwitchingAccount(false);
      return;
    }
    window.location.href = "/lobby";
  }

  // Werkt voor een partij in elke status — de admin mag altijd verwijderen
  // (zie de DELETE-policy op games), dus deze knop verschijnt straks bij
  // wachtende, actieve én afgeronde partijen.
  async function deleteGame(gameId) {
    if (!window.confirm("Deze partij verwijderen?")) return;
    setError(null);
    setDeletingId(gameId);
    const { error } = await supabase.from("games").delete().eq("id", gameId);
    setDeletingId(null);
    if (error) { setError("Verwijderen mislukt: " + error.message); return; }
    setActiveGames((list) => list.filter((g) => g.id !== gameId));
    setWaitingGames((list) => list.filter((g) => g.id !== gameId));
    setFinishedGames((list) => list.filter((g) => g.id !== gameId));
  }

  async function deleteFeedback(id) {
    if (!window.confirm("Deze feedback verwijderen?")) return;
    setError(null);
    const { error } = await supabase.from("feedback").delete().eq("id", id);
    if (error) { setError("Verwijderen mislukt: " + error.message); return; }
    setFeedback((list) => list.filter((f) => f.id !== id));
  }

  // Klap een gebruikersrij open/dicht; bij het openen worden hun recente
  // partijen en vriendenlijst pas dan opgehaald (niet vooraf voor iedereen).
  async function toggleUserExpand(userId) {
    if (expandedUserId === userId) { setExpandedUserId(null); return; }
    setExpandedUserId(userId);
    setExpandedUserLoading(true);
    const [{ data: games }, { data: friendRows }] = await Promise.all([
      supabase
        .from("games")
        .select("id, status, created_at, vs_computer, local_multiplayer, state, a:player_a(username, rating), b:player_b(username, rating)")
        .or(`player_a.eq.${userId},player_b.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("friendships")
        .select("requester_id, addressee_id, requester:requester_id(username), addressee:addressee_id(username)")
        .eq("status", "accepted")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    ]);
    const myRole = (g) => (g.player_a === userId ? "A" : "B");
    setExpandedUserGames((games || []).map((g) => ({ ...g, __role: myRole(g) })));
    setExpandedUserFriends(
      (friendRows || []).map((r) => (r.requester_id === userId ? r.addressee : r.requester)).filter(Boolean)
    );
    setExpandedUserLoading(false);
  }

  function startEditRating(u) {
    setEditingRatingId(u.id);
    setRatingInput(String(u.rating));
    setRatingError(null);
  }

  function cancelEditRating() {
    setEditingRatingId(null);
    setRatingInput("");
    setRatingError(null);
  }

  async function saveRating(userId) {
    const value = parseInt(ratingInput, 10);
    if (!Number.isFinite(value)) { setRatingError("Ongeldig getal."); return; }
    setRatingSaving(true);
    setRatingError(null);
    const { error } = await supabase.from("profiles").update({ rating: value }).eq("id", userId);
    setRatingSaving(false);
    if (error) { setRatingError("Opslaan mislukt: " + error.message); return; }
    setUsers((list) => list.map((u) => (u.id === userId ? { ...u, rating: value } : u)));
    setEditingRatingId(null);
  }

  async function postAnnouncement(e) {
    e.preventDefault();
    const message = announcementText.trim();
    if (!message || !adminId) return;
    setAnnouncementPosting(true);
    setAnnouncementError(null);
    const { data, error } = await supabase.from("announcements").insert({ message, created_by: adminId }).select().single();
    setAnnouncementPosting(false);
    if (error) { setAnnouncementError("Plaatsen mislukt: " + error.message); return; }
    setAnnouncements((list) => [data, ...list]);
    setAnnouncementText("");
  }

  async function toggleAnnouncementActive(a) {
    setAnnouncementError(null);
    const { error } = await supabase.from("announcements").update({ active: !a.active }).eq("id", a.id);
    if (error) { setAnnouncementError("Wijzigen mislukt: " + error.message); return; }
    setAnnouncements((list) => list.map((x) => (x.id === a.id ? { ...x, active: !a.active } : x)));
  }

  async function deleteAnnouncement(id) {
    if (!window.confirm("Deze melding verwijderen?")) return;
    setAnnouncementError(null);
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) { setAnnouncementError("Verwijderen mislukt: " + error.message); return; }
    setAnnouncements((list) => list.filter((a) => a.id !== id));
  }

  // Nieuwe bugfix-entry — alleen Nederlands invulbaar hier; vertalingen
  // (EN/DE/FR/ES/IT) moeten er apart bij (bv. handmatig via SQL, of vraag
  // het in een volgend gesprek) — anders valt de UI in andere talen terug
  // op deze Nederlandse tekst (zie lib/i18n en lobby/page.js). Start altijd
  // als concept (confirmed = false): pas na expliciet bevestigen hieronder
  // wordt een entry zichtbaar in de lobby.
  async function postBugfix(e) {
    e.preventDefault();
    const title = bugfixTitleInput.trim();
    const detail = bugfixDetailInput.trim();
    if (!title || !detail) return;
    setBugfixPosting(true);
    setBugfixError(null);
    const { data, error } = await supabase
      .from("bugfixes")
      .insert({ title: { nl: title }, detail: { nl: detail }, confirmed: false })
      .select()
      .single();
    setBugfixPosting(false);
    if (error) { setBugfixError("Plaatsen mislukt: " + error.message); return; }
    setBugfixes((list) => [data, ...list]);
    setBugfixTitleInput("");
    setBugfixDetailInput("");
  }

  async function toggleBugfixConfirmed(fix) {
    setBugfixError(null);
    const { error } = await supabase.from("bugfixes").update({ confirmed: !fix.confirmed }).eq("id", fix.id);
    if (error) { setBugfixError("Wijzigen mislukt: " + error.message); return; }
    setBugfixes((list) => list.map((x) => (x.id === fix.id ? { ...x, confirmed: !fix.confirmed } : x)));
  }

  async function deleteBugfix(id) {
    if (!window.confirm("Deze bugfix-entry verwijderen?")) return;
    setBugfixError(null);
    const { error } = await supabase.from("bugfixes").delete().eq("id", id);
    if (error) { setBugfixError("Verwijderen mislukt: " + error.message); return; }
    setBugfixes((list) => list.filter((x) => x.id !== id));
  }

  if (loading || !allowed) return <main className="min-h-screen flex items-center justify-center"><BoardLoader /></main>;

  const avgRating = users.length ? Math.round(users.reduce((sum, u) => sum + u.rating, 0) / users.length) : null;
  const filteredUsers = users
    .filter((u) => u.username.toLowerCase().includes(userSearch.trim().toLowerCase()))
    .sort((a, b) => (sortMode === "rating" ? b.rating - a.rating : new Date(b.created_at) - new Date(a.created_at)));

  return (
    <main className="min-h-screen px-4 py-10 max-w-3xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold uppercase tracking-widest">Admin</h1>
        <button className="btn" onClick={() => setToolsMenuOpen(true)}>
          <Wrench size={15} /> Tools
        </button>
      </div>

      {toolsMenuOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "flex-start", justifyContent: "flex-end", zIndex: 55, padding: "1rem",
          }}
          onClick={() => setToolsMenuOpen(false)}
        >
          <div
            className="panel"
            style={{ width: "100%", maxWidth: 280, display: "flex", flexDirection: "column", gap: 4 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <span className="text-sm uppercase tracking-widest" style={{ color: "var(--accent)" }}>Tools</span>
              <button className="btn btn-icon" onClick={() => setToolsMenuOpen(false)}><X size={16} /></button>
            </div>
            <Link className="sidebar-link" href="/admin/content" onClick={() => setToolsMenuOpen(false)}>
              <FileEdit size={17} strokeWidth={2} /> Site-inhoud
            </Link>
            <Link className="sidebar-link" href="/admin/todos" onClick={() => setToolsMenuOpen(false)}>
              <ListTodo size={17} strokeWidth={2} /> To-do&apos;s
            </Link>
            {/* Dev-gemak: snel wisselen naar het "Joram"-testaccount. Altijd
                zichtbaar (uitgeschakeld met uitleg zolang er nog geen bewaarde
                sessie voor Joram is — dan moet daar eerst één keer mee
                ingelogd worden). */}
            <button
              className="sidebar-link"
              style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
              onClick={() => { setToolsMenuOpen(false); switchToJoram(); }}
              disabled={switchingAccount || !getDevSession("Joram")}
              title={!getDevSession("Joram") ? "Log eerst één keer in als Joram om te kunnen wisselen" : undefined}
            >
              <ArrowLeftRight size={17} strokeWidth={2} /> {switchingAccount ? "Bezig..." : "Wissel naar Joram"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm" style={{ color: "#e07a5f" }}>{error}</p>}

      <section className="panel">
        <details open>
          <summary className="summary-reset text-sm uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--accent)" }}>
            Overzicht
            <ChevronRight size={15} className="details-chevron" />
          </summary>
          <div className="carousel mt-3">
            <div className="stat-card">
              <span className="stat-card-value">{gameCounts.total}</span>
              <span className="stat-card-label">Partijen totaal</span>
            </div>
            <div className="stat-card">
              <span className="stat-card-value">{gameCounts.today}</span>
              <span className="stat-card-label">Vandaag gestart</span>
            </div>
            <div className="stat-card">
              <span className="stat-card-value">{avgRating ?? "—"}</span>
              <span className="stat-card-label">Gem. rating</span>
            </div>
            <div className="stat-card">
              <span className="stat-card-value" style={{ color: "#9db98a" }}>{onlineIds.size}</span>
              <span className="stat-card-label">Nu online</span>
            </div>
          </div>
        </details>
      </section>

      <section className="panel">
        <details>
          <summary className="summary-reset text-sm uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--accent)" }}>
            Gebruikers — {filteredUsers.length} van {users.length}, {onlineIds.size} online
            <ChevronRight size={15} className="details-chevron" />
          </summary>
        <div className="flex items-center gap-2 mb-3 mt-3">
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
            <input
              type="text"
              className="input"
              style={{ paddingLeft: 32, width: "100%" }}
              placeholder="Zoek gebruikersnaam..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </div>
          <button className="btn" onClick={() => setSortMode((m) => (m === "rating" ? "recent" : "rating"))}>
            {sortMode === "rating" ? "Op rating" : "Op nieuwste"}
          </button>
        </div>
        <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto">
          {filteredUsers.map((u) => (
            <li key={u.id} style={{ borderBottom: "1px solid var(--panel-line)", paddingBottom: 8 }}>
              <div className="flex items-center justify-between text-sm">
                <button
                  className="mono flex items-center gap-2"
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--muted)" }}
                  onClick={() => toggleUserExpand(u.id)}
                >
                  <ChevronDown
                    size={14}
                    style={{ transform: expandedUserId === u.id ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 150ms" }}
                  />
                  <Avatar username={u.username} /> {u.username}
                  {editingRatingId !== u.id && <Rating value={u.rating} />}
                </button>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {editingRatingId === u.id ? (
                    <>
                      <input
                        type="number"
                        className="input"
                        style={{ width: 72, padding: "4px 8px" }}
                        value={ratingInput}
                        onChange={(e) => setRatingInput(e.target.value)}
                        autoFocus
                      />
                      <button className="btn btn-icon" title="Opslaan" onClick={() => saveRating(u.id)} disabled={ratingSaving}>
                        <Check size={14} />
                      </button>
                      <button className="btn btn-icon" title="Annuleren" onClick={cancelEditRating}>
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-icon" title="Rating aanpassen" onClick={() => startEditRating(u)}>
                      <Pencil size={14} />
                    </button>
                  )}
                  <Badge tone={onlineIds.has(u.id) ? "online" : "offline"}>
                    {onlineIds.has(u.id) ? "online" : "offline"}
                  </Badge>
                </div>
              </div>
              {editingRatingId === u.id && ratingError && (
                <p className="text-xs mt-1" style={{ color: "#e07a5f" }}>{ratingError}</p>
              )}

              {expandedUserId === u.id && (
                <div className="flex flex-col gap-3 mt-3" style={{ paddingLeft: 22 }}>
                  {expandedUserLoading ? (
                    <p className="text-xs" style={{ color: "var(--muted)" }}>Laden...</p>
                  ) : (
                    <>
                      <div>
                        <h3 className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--muted)" }}>
                          Recente partijen
                        </h3>
                        {expandedUserGames.length === 0 ? (
                          <p className="text-xs" style={{ color: "var(--muted)" }}>Nog geen partijen.</p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {expandedUserGames.map((g) => (
                              <li key={g.id} className="text-xs flex items-center justify-between" style={{ color: "var(--muted)" }}>
                                <span>
                                  vs {opponentNameFor(g, g.__role)}
                                  {g.status === "finished" && (
                                    <Badge tone={g.state?.winner === g.__role || g.local_multiplayer ? "active" : "closed"}>
                                      {g.local_multiplayer ? "afgerond" : (g.state?.winner === g.__role ? "gewonnen" : "verloren")}
                                    </Badge>
                                  )}
                                  {g.status !== "finished" && <Badge tone="waiting">{g.status}</Badge>}
                                </span>
                                <a className="btn btn-icon" href={`/game/${g.id}`} title="Bekijk"><Eye size={12} /></a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <h3 className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--muted)" }}>
                          Vrienden — {expandedUserFriends.length}
                        </h3>
                        {expandedUserFriends.length === 0 ? (
                          <p className="text-xs" style={{ color: "var(--muted)" }}>Geen vrienden.</p>
                        ) : (
                          <p className="text-xs" style={{ color: "var(--muted)" }}>
                            {expandedUserFriends.map((f) => f.username).join(", ")}
                          </p>
                        )}
                      </div>
                      <div>
                        <h3 className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--muted)" }}>
                          Feedback van deze gebruiker
                        </h3>
                        {feedback.filter((f) => f.user_id === u.id).length === 0 ? (
                          <p className="text-xs" style={{ color: "var(--muted)" }}>Geen feedback ingestuurd.</p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {feedback.filter((f) => f.user_id === u.id).map((f) => (
                              <li key={f.id} className="text-xs" style={{ color: "var(--muted)" }}>&ldquo;{f.message}&rdquo;</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        </details>
      </section>

      <section className="panel">
        <details>
          <summary className="summary-reset text-sm uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--accent)" }}>
            <Megaphone size={15} /> Meldingen
            <ChevronRight size={15} className="details-chevron" />
          </summary>
        <p className="text-xs mb-3 mt-3" style={{ color: "var(--muted)" }}>
          Verschijnt als een balkje bovenaan bij alle gebruikers, tot ze &apos;m wegklikken.
        </p>
        <form onSubmit={postAnnouncement} className="flex items-center gap-2 mb-3">
          <input
            type="text"
            className="input"
            style={{ flex: 1 }}
            placeholder="Nieuwe melding..."
            value={announcementText}
            onChange={(e) => setAnnouncementText(e.target.value)}
            maxLength={280}
          />
          <button className="btn btn-solid" type="submit" disabled={announcementPosting || !announcementText.trim()}>
            <Send size={14} /> {announcementPosting ? "Bezig..." : "Plaatsen"}
          </button>
        </form>
        {announcementError && <p className="text-xs mb-2" style={{ color: "#e07a5f" }}>{announcementError}</p>}
        {announcements.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Nog geen meldingen geplaatst.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {announcements.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm gap-2">
                <span style={{ opacity: a.active ? 1 : 0.5 }}>
                  {a.message}{" "}
                  <Badge tone={a.active ? "active" : "neutral"}>{a.active ? "actief" : "uit"}</Badge>
                </span>
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  <button className="btn btn-icon" title={a.active ? "Deactiveren" : "Activeren"} onClick={() => toggleAnnouncementActive(a)}>
                    {a.active ? <X size={14} /> : <Check size={14} />}
                  </button>
                  <button className="btn btn-icon btn-danger" title="Verwijderen" onClick={() => deleteAnnouncement(a.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        </details>
      </section>

      <section className="panel">
        <details>
          <summary className="summary-reset text-sm uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--accent)" }}>
            <Bug size={15} /> Opgeloste bugs
            <ChevronRight size={15} className="details-chevron" />
          </summary>
        <p className="text-xs mb-3 mt-3" style={{ color: "var(--muted)" }}>
          Nieuwe entries staan als concept tot je ze bevestigt — pas dan zijn ze zichtbaar in de lobby. Alleen
          Nederlands hier invullen; voor de andere talen (EN/DE/FR/ES/IT) val je anders terug op deze tekst, tenzij
          je &apos;m later apart laat vertalen.
        </p>
        <form onSubmit={postBugfix} className="flex flex-col gap-2 mb-3">
          <input
            type="text"
            className="input"
            placeholder="Titel..."
            value={bugfixTitleInput}
            onChange={(e) => setBugfixTitleInput(e.target.value)}
            maxLength={120}
          />
          <textarea
            className="input"
            rows={2}
            placeholder="Toelichting..."
            value={bugfixDetailInput}
            onChange={(e) => setBugfixDetailInput(e.target.value)}
          />
          <button className="btn btn-solid" type="submit" disabled={bugfixPosting || !bugfixTitleInput.trim() || !bugfixDetailInput.trim()}>
            <Send size={14} /> {bugfixPosting ? "Bezig..." : "Toevoegen als concept"}
          </button>
        </form>
        {bugfixError && <p className="text-xs mb-2" style={{ color: "#e07a5f" }}>{bugfixError}</p>}
        {bugfixes.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Nog geen bugfixes.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {bugfixes.map((fix) => (
              <li key={fix.id} className="text-sm border-t pt-2" style={{ borderColor: "var(--panel-line)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span style={{ opacity: fix.confirmed ? 1 : 0.6 }}>
                    <strong>{fix.title?.nl || fix.title?.en}</strong>{" "}
                    <Badge tone={fix.confirmed ? "active" : "neutral"}>{fix.confirmed ? "zichtbaar" : "concept"}</Badge>
                  </span>
                  <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                    <button
                      className="btn btn-icon"
                      title={fix.confirmed ? "Verbergen" : "Bevestigen (maakt zichtbaar)"}
                      onClick={() => toggleBugfixConfirmed(fix)}
                    >
                      {fix.confirmed ? <X size={14} /> : <Check size={14} />}
                    </button>
                    <button className="btn btn-icon btn-danger" title="Verwijderen" onClick={() => deleteBugfix(fix.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{fix.detail?.nl || fix.detail?.en}</p>
              </li>
            ))}
          </ul>
        )}
        </details>
      </section>

      <section className="panel">
        <details>
          <summary className="summary-reset text-sm uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--accent)" }}>
            <MessageSquare size={15} /> Feedback
            <ChevronRight size={15} className="details-chevron" />
          </summary>
        {feedback.length === 0 && (
          <p className="text-sm mt-3" style={{ color: "var(--muted)" }}>Nog geen feedback ontvangen.</p>
        )}
        <ul className="flex flex-col gap-3 mt-3 max-h-96 overflow-y-auto">
          {feedback.map((f) => (
            <li key={f.id} className="text-sm border-t pt-2 flex items-start justify-between gap-2" style={{ borderColor: "var(--panel-line)" }}>
              <div>
                <div className="mono flex items-center gap-2" style={{ color: "var(--muted)", fontSize: "12px" }}>
                  <Avatar username={f.profiles?.username} size={18} />
                  {f.profiles?.username || "onbekend"} · {new Date(f.created_at).toLocaleString("nl-NL")}
                </div>
                <div>{f.message}</div>
              </div>
              <button className="btn btn-icon" title="Verwijderen" onClick={() => deleteFeedback(f.id)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        </details>
      </section>

      <section className="panel">
        <details>
          <summary className="summary-reset text-sm uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--accent)" }}>
            <Swords size={15} /> Actieve partijen — {activeGames.length}
            <ChevronRight size={15} className="details-chevron" />
          </summary>
        {activeGames.length === 0 && (
          <p className="text-sm mt-3" style={{ color: "var(--muted)" }}>Geen actieve partijen.</p>
        )}
        <ul className="flex flex-col gap-2 mt-3">
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
        </details>
      </section>

      <section className="panel">
        <details>
          <summary className="summary-reset text-sm uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--accent)" }}>
            <Clock size={15} /> Wachtende partijen — {waitingGames.length}
            <ChevronRight size={15} className="details-chevron" />
          </summary>
        {waitingGames.length === 0 && (
          <p className="text-sm mt-3" style={{ color: "var(--muted)" }}>Geen wachtende partijen.</p>
        )}
        <ul className="flex flex-col gap-2 mt-3">
          {waitingGames.map((g) => (
            <li key={g.id} className="flex items-center justify-between text-sm">
              <span className="mono flex items-center gap-2 flex-wrap" style={{ color: "var(--muted)" }}>
                <Avatar username={g.a?.username} size={22} /> {g.a?.username || "onbekend"} <Rating value={g.a?.rating} />
                <Badge tone="waiting">
                  {g.invited ? `uitnodiging voor ${g.invited.username}` : "open voor iedereen"}
                </Badge>
              </span>
              <button className="btn btn-danger" onClick={() => deleteGame(g.id)} disabled={deletingId === g.id}>
                <Trash2 size={14} /> {deletingId === g.id ? "Bezig..." : "Verwijderen"}
              </button>
            </li>
          ))}
        </ul>
        </details>
      </section>

      <section className="panel">
        <details>
          <summary className="summary-reset text-sm uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--accent)" }}>
            <Trophy size={15} /> Recent afgeronde partijen — {finishedGames.length}
            <ChevronRight size={15} className="details-chevron" />
          </summary>
        {finishedGames.length === 0 && (
          <p className="text-sm mt-3" style={{ color: "var(--muted)" }}>Nog geen afgeronde partijen.</p>
        )}
        <ul className="flex flex-col gap-2 mt-3 max-h-96 overflow-y-auto">
          {finishedGames.map((g) => {
            const winnerName = g.local_multiplayer
              ? (g.state?.localNames?.[g.state?.winner] || `Speler ${g.state?.winner}`)
              : (g.state?.winner === "A" ? g.a?.username : opponentNameFor(g, "A"));
            return (
              <li key={g.id} className="flex items-center justify-between text-sm">
                <span className="mono flex items-center gap-1 flex-wrap" style={{ color: "var(--muted)" }}>
                  <Avatar username={g.a?.username} size={22} /> {g.a?.username || "onbekend"}
                  <span style={{ margin: "0 4px" }}>vs</span>
                  <Avatar username={opponentNameFor(g, "A")} size={22} /> {opponentNameFor(g, "A") || "onbekend"}
                  <Badge tone="active"><Trophy size={12} /> {winnerName || "onbekend"} won</Badge>
                </span>
                <div className="flex items-center gap-2">
                  <a className="btn btn-icon" href={`/game/${g.id}`} title="Bekijk"><Eye size={14} /></a>
                  <button className="btn btn-icon btn-danger" title="Verwijderen" onClick={() => deleteGame(g.id)} disabled={deletingId === g.id}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        </details>
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
