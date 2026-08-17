"use client";
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Square, Trophy, Flag, Archive,
  ChevronLeft, ChevronRight, Eye, MessageCircle, Send, TriangleAlert, Check, X, RotateCcw,
} from "lucide-react";
import { applyMove, applyPlaceTool, reconstructBoard, bothPawnsCanReachCenter, DIRS } from "@/lib/collisionEngine";
import { chooseComputerTurn } from "@/lib/collisionAI";
import { Avatar, Rating, DirBtn, ToolIcon, BoardLoader } from "@/lib/ui";
import Board, { diffMove } from "@/lib/Board";
import { useTranslation } from "@/lib/i18n";

function Confetti() {
  // Lazy initializer: draait maar één keer (bij mount), dus de
  // willekeurigheid hier levert een stabiele waarde op voor de levensduur
  // van dit component-exemplaar, i.p.v. instabiele waarden per render.
  const [pieces] = useState(() => {
    const colors = ["var(--accent)", "var(--maple)", "var(--walnut)", "#e07a5f", "#f0ece2"];
    return Array.from({ length: 70 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 2.2 + Math.random() * 1.6,
      color: colors[i % colors.length],
      rotate: Math.floor(Math.random() * 360),
    }));
  });

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 60 }}>
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export default function GamePage() {
  const { id } = useParams();
  const router = useRouter();
  const t = useTranslation();
  // Ref-kopie van t() voor gebruik binnen de init-useEffect hieronder — die
  // moet alleen bij een andere game-id opnieuw draaien (subscriptions e.d.),
  // niet bij elke taalwissel, dus t zelf hoort niet in die dependency-array.
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  const [user, setUser] = useState(null);
  const [game, setGame] = useState(null);
  const [myRole, setMyRole] = useState(null); // 'A' | 'B'
  const [selected, setSelected] = useState(null); // {r,c}
  const [placing, setPlacing] = useState(false);
  const [pendingPlacement, setPendingPlacement] = useState(null); // {r,c} — geselecteerd, nog niet bevestigd
  const [movedThisTurn, setMovedThisTurn] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOverlay, setShowOverlay] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archived, setArchived] = useState(false);
  const [archiveError, setArchiveError] = useState(null);
  const [slideAnim, setSlideAnim] = useState(null);
  const [playerNames, setPlayerNames] = useState({ A: null, B: null });
  const [playerRatings, setPlayerRatings] = useState({ A: null, B: null });
  const [ratingDelta, setRatingDelta] = useState(null); // { A, B } — verschil t.o.v. rating bij het laden van deze pagina
  const [historyIndex, setHistoryIndex] = useState(null); // null = live, anders index in state.history
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [lastSeenCount, setLastSeenCount] = useState(0); // messages.length bij het laatst openen van de chat
  const prevBoardRef = useRef(null);
  const chatEndRef = useRef(null);
  const activeChipRef = useRef(null);
  const computerTurnRef = useRef(false);
  const stateRef = useRef(null);
  // Laatste door de server bevestigde staat — het startpunt van mijn
  // huidige beurt. Zolang ik nog geen zet geforceerd hoefde af te ronden
  // (dood spoor) of expliciet STOP/bevestig heb ingedrukt, staan mijn
  // tussentijdse zetten alleen lokaal in `game.state` (zie handleMove) en
  // kan ik met cancelTurn() altijd weer hiernaartoe terug.
  const committedStateRef = useRef(null);
  const initialRatingsRef = useRef({ A: null, B: null });
  const ratingAppliedRef = useRef(false);

  useEffect(() => {
    let channel;

    // Roept de rating-berekening aan zodra een partij tussen twee echte
    // spelers is afgelopen (nooit voor vs_computer). apply_game_rating is
    // idempotent (bewaakt via games.rating_applied), dus dit mag gerust
    // vaker aangeroepen worden dan strikt nodig. ratingAppliedRef voorkomt
    // alleen dubbele netwerk-calls vanuit deze ene client.
    async function maybeApplyRating(gameRow) {
      if (!gameRow || gameRow.vs_computer || gameRow.local_multiplayer || gameRow.status !== "finished" || !gameRow.state?.winner) return;
      if (ratingAppliedRef.current) return;
      ratingAppliedRef.current = true;

      await supabase.rpc("apply_game_rating", { p_game_id: id });
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, rating")
        .in("id", [gameRow.player_a, gameRow.player_b]);
      if (!profiles) return;
      const byId = Object.fromEntries(profiles.map((p) => [p.id, p.rating]));
      const newA = byId[gameRow.player_a];
      const newB = byId[gameRow.player_b];
      const before = initialRatingsRef.current;
      setPlayerRatings({ A: newA ?? before.A, B: newB ?? before.B });
      setRatingDelta({
        A: before.A != null && newA != null ? newA - before.A : null,
        B: before.B != null && newB != null ? newB - before.B : null,
      });
    }

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);

      const { data, error } = await supabase
        .from("games")
        .select("*, a:player_a(username, rating), b:player_b(username, rating)")
        .eq("id", id)
        .single();
      if (error || !data) { setError(tRef.current("game.error.notFound")); setLoading(false); return; }
      setGame(data);
      committedStateRef.current = data.state;
      if (data.local_multiplayer) {
        setPlayerNames({
          A: data.state?.localNames?.A || tRef.current("lobby.modal.local.player1Placeholder"),
          B: data.state?.localNames?.B || tRef.current("lobby.modal.local.player2Placeholder"),
        });
      } else {
        setPlayerNames({ A: data.a?.username || null, B: data.vs_computer ? "Computer" : (data.b?.username || null) });
      }
      const initialRatings = data.local_multiplayer
        ? { A: null, B: null }
        : { A: data.a?.rating ?? null, B: data.vs_computer ? null : (data.b?.rating ?? null) };
      setPlayerRatings(initialRatings);
      initialRatingsRef.current = initialRatings;
      const role = data.player_a === user.id ? "A" : data.player_b === user.id ? "B" : null;
      setMyRole(role);
      setLoading(false);

      maybeApplyRating(data);

      if (role) {
        const { data: msgs } = await supabase
          .from("game_messages")
          .select("id, sender_id, body, created_at, profiles:sender_id(username)")
          .eq("game_id", id)
          .order("created_at", { ascending: true });
        setMessages(msgs || []);
        setLastSeenCount((msgs || []).length);
      }

      channel = supabase
        .channel(`game-${id}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${id}` },
          (payload) => {
            committedStateRef.current = payload.new?.state;
            setGame((prev) => {
              if (!prev?.state?.winner && payload.new?.state?.winner) {
                setShowOverlay(true);
                maybeApplyRating(payload.new);
              }
              return payload.new;
            });
            setSelected(null);
            setMovedThisTurn(false);
            setPlacing(false);
            setPendingPlacement(null);
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "game_messages", filter: `game_id=eq.${id}` },
          async (payload) => {
            const { data: sender } = await supabase
              .from("profiles")
              .select("username")
              .eq("id", payload.new.sender_id)
              .single();
            setMessages((prev) => [...prev, { ...payload.new, profiles: sender }]);
          }
        )
        .subscribe();
    }

    init();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [id, router]);

  const state = game?.state;
  useEffect(() => { stateRef.current = state; }, [state]);
  // Bij lokaal pass-and-play bestuurt player_a (de enige echte account)
  // om beurten beide kanten — effectiveRole wijst naar de kant die nu aan
  // zet is, zodat dezelfde speler op hetzelfde apparaat gewoon door kan
  // spelen. Voor online partijen is dit gelijk aan myRole.
  const effectiveRole = (game?.local_multiplayer && myRole === "A") ? state?.turn : myRole;
  const isMyTurn = state && effectiveRole && state.turn === effectiveRole && !state.winner;
  const nameFor = (role) => playerNames[role] || t("game.playerFallback", { role });
  const canStopHere = state ? bothPawnsCanReachCenter(state.board, state.pawnPos) : true;

  const history = state?.history || [];
  const viewingHistory = historyIndex !== null;
  const displayBoard = viewingHistory ? reconstructBoard(history, historyIndex) : state?.board;

  // Groepeert de vlakke geschiedenis in "beurten" (opeenvolgende stuiters
  // van dezelfde speler binnen één beurt tellen als één), en die weer per
  // twee (A + B) in "ronden" — net als schaaknotatie (1. e4 e5), maar dan
  // met coördinaten i.p.v. algebraïsche notatie. Vervangt zowel de losse
  // schuifbalk als het aparte tekstvlak met zetbeschrijvingen door één
  // compacte, horizontaal scrollbare strip.
  const turns = [];
  history.forEach((entry, i) => {
    const last = turns[turns.length - 1];
    if (last && last.owner === entry.owner) {
      last.endIndex = i;
      last.lastEntry = entry;
    } else {
      turns.push({ owner: entry.owner, endIndex: i, lastEntry: entry });
    }
  });
  const rounds = [];
  for (let i = 0; i < turns.length; i += 2) {
    rounds.push([turns[i], turns[i + 1] || null]);
  }
  const activeHistoryIndex = viewingHistory ? historyIndex : history.length - 1;

  function stepHistoryBack() {
    setHistoryIndex((i) => {
      const cur = i === null ? history.length - 1 : i;
      return Math.max(-1, cur - 1);
    });
  }

  function stepHistoryForward() {
    setHistoryIndex((i) => {
      if (i === null) return null;
      const next = i + 1;
      return next >= history.length - 1 ? null : next;
    });
  }

  // useLayoutEffect (niet useEffect) i.p.v.: dit moet vóór de browser
  // schildert al vaststaan welk stuk er "schuift" — anders toont het eerste
  // geschilderde frame al even kort de definitieve bordstaat (het stuk staat
  // daarin al op de eindpositie), en pas ná die flits begint de animatie
  // alsnog vanaf het startpunt. useLayoutEffect draait synchroon vóór de
  // paint, dus de ghost (zie Board.js) staat er al bij het allereerste
  // geschilderde frame, zonder die tussenflits.
  useLayoutEffect(() => {
    if (!state?.board) return;
    const prevBoard = prevBoardRef.current;
    if (prevBoard && prevBoard !== state.board) {
      const reduceMotion = typeof window !== "undefined"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduceMotion) {
        const diff = diffMove(prevBoard, state.board);
        if (diff) setSlideAnim({ ...diff, animating: false });
      }
    }
    prevBoardRef.current = state.board;
  }, [state?.board]);

  useEffect(() => {
    if (!slideAnim || slideAnim.animating) return;
    const raf = requestAnimationFrame(() => {
      setSlideAnim((s) => (s ? { ...s, animating: true } : s));
    });
    return () => cancelAnimationFrame(raf);
  }, [slideAnim]);

  useEffect(() => {
    if (!slideAnim?.animating) return;
    const t = setTimeout(() => setSlideAnim(null), 260);
    return () => clearTimeout(t);
  }, [slideAnim?.animating]);

  const pushState = useCallback(async (nextState, status) => {
    const payload = status ? { state: nextState, status } : { state: nextState };
    const { error } = await supabase.from("games").update(payload).eq("id", id);
    if (error) setError(error.message);
  }, [id]);

  // Speelt de beurt van de computerspeler (rol B) uit. Draait alleen in de
  // browser van de eigenaar (rol A) — er is geen aparte databasegebruiker
  // voor de computer, dus alleen die client mag zetten voor B berekenen.
  // Let op: de dependency-array bevat bewust alleen primitieven, niet het
  // hele `state`-object — anders zou elke tussenliggende zet binnen dezelfde
  // computerbeurt (via de realtime-update) dit effect opnieuw laten
  // opstarten en zichzelf meteen weer afbreken.
  useEffect(() => {
    if (!game?.vs_computer || myRole !== "A" || state?.winner) return;
    if (state?.turn !== "B") return;
    if (computerTurnRef.current) return;
    computerTurnRef.current = true;
    let cancelled = false;

    (async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const startState = stateRef.current;
      if (cancelled || !startState) { computerTurnRef.current = false; return; }

      const action = chooseComputerTurn(startState, "B", game.difficulty);
      if (!action) {
        await pushState({ ...startState, turn: "A" });
        computerTurnRef.current = false;
        return;
      }

      if (action.type === "place") {
        const result = applyPlaceTool(startState, "B", action.r, action.c);
        if (result.ok) await pushState(result.state);
        else if (!cancelled) await pushState({ ...startState, turn: "A" });
      } else {
        let cur = startState;
        let pos = action.from;
        let movedAny = false;
        for (let i = 0; i < action.dirs.length; i++) {
          if (cancelled) break;
          const isLast = i === action.dirs.length - 1;
          const result = applyMove(cur, "B", pos, action.dirs[i], isLast);
          if (!result.ok) break;
          movedAny = true;
          cur = result.state;
          pos = result.dest;
          await pushState(cur, result.winningMove ? "finished" : undefined);
          if (result.winningMove) break;
          if (!isLast) await new Promise((resolve) => setTimeout(resolve, 500));
        }
        // Veiligheidsvangnet: als er (onverwacht) geen enkel segment lukte,
        // toch de beurt doorgeven zodat het spel nooit vastloopt.
        if (!movedAny && !cancelled) await pushState({ ...startState, turn: "A" });
      }
      computerTurnRef.current = false;
    })();

    return () => { cancelled = true; };
  }, [game?.vs_computer, game?.difficulty, myRole, state?.turn, state?.winner, pushState]);

  function selectCell(r, c) {
    if (viewingHistory || !isMyTurn || placing) return;
    const isSameCell = selected && selected.r === r && selected.c === c;
    // Nogmaals op je al-geselecteerde stuk tikken deselecteert het weer,
    // zodat je iets anders kunt proberen (een ander stuk, of een hulpstuk
    // plaatsen) — maar alleen vóórdat je bewogen hebt. Daarna zit je aan
    // die zet vast tot STOP of Annuleer beurt.
    if (isSameCell && !movedThisTurn) { setSelected(null); return; }
    if (movedThisTurn && !isSameCell) return;
    const cell = state.board[r][c];
    if (!cell || cell.owner !== effectiveRole) return;
    setSelected({ r, c, type: cell.type });
  }

  // Tikken op een vakje tijdens het plaatsen zet alleen een preview neer
  // (pendingPlacement) — er wordt pas echt geplaatst (en de beurt
  // doorgegeven) als de speler dat expliciet bevestigt. Opnieuw tikken op
  // een ander geldig vakje verplaatst gewoon de preview.
  function handlePlaceCellTap(r, c) {
    if (viewingHistory || !isMyTurn || !placing) return;
    const result = applyPlaceTool(state, effectiveRole, r, c);
    if (!result.ok) { setError(t(`engine.error.${result.error}`)); return; }
    setError(null);
    setPendingPlacement({ r, c });
  }

  function confirmPlacement() {
    if (!pendingPlacement || !state) return;
    const result = applyPlaceTool(state, effectiveRole, pendingPlacement.r, pendingPlacement.c);
    if (!result.ok) {
      // Zeldzaam: staat kan tussen preview en bevestiging gewijzigd zijn.
      setError(t(`engine.error.${result.error}`));
      setPendingPlacement(null);
      return;
    }
    setError(null);
    setPendingPlacement(null);
    setPlacing(false);
    pushState(result.state);
  }

  function cancelPlacement() {
    setPlacing(false);
    setPendingPlacement(null);
    setError(null);
  }

  function handleMove(dir) {
    if (!isMyTurn || !selected) return;
    const result = applyMove(state, effectiveRole, [selected.r, selected.c], dir, false);
    if (!result.ok) { setError(t(`engine.error.${result.error}`)); return; }
    setError(null);
    if (result.winningMove) { pushState(result.state, "finished"); return; }
    setSelected({ r: result.dest[0], c: result.dest[1], type: selected.type });
    setMovedThisTurn(true);
    if (result.turnEnded) { pushState(result.state); }
    else { setGame({ ...game, state: result.state }); } // lokale preview binnen dezelfde beurt
  }

  function endTurn() {
    if (!selected || !state) return;
    // De insluitregel geldt pas op het moment dat de beurt echt eindigt —
    // je mag onderweg (tussen twee stuiters in) best over zo'n positie
    // heen bewegen, maar hier, waar de beurt zou stoppen, moet 't gecheckt
    // worden (applyMove valideert dit al per stuiter, maar STOP eindigt de
    // beurt buiten applyMove om).
    if (!bothPawnsCanReachCenter(state.board, state.pawnPos)) {
      setError(t("engine.error.cannotStopHere"));
      return;
    }
    setError(null);
    const opp = effectiveRole === "A" ? "B" : "A";
    pushState({ ...state, turn: opp });
  }

  // Zolang er nog geen enkele zet van deze beurt naar de server gepusht is
  // (dat gebeurt alleen bij een gedwongen stop, wat de beurt meteen ook
  // beëindigt — zie handleMove), leeft de hele beurt alleen lokaal. Dit
  // gooit die lokale tussenstand weg en zet alles terug naar de laatst
  // bevestigde staat, zodat je vrij opnieuw kunt beginnen: een ander stuk
  // kiezen, of alsnog een hulpstuk plaatsen in plaats van bewegen.
  function cancelTurn() {
    if (!committedStateRef.current) return;
    setGame((g) => (g ? { ...g, state: committedStateRef.current } : g));
    setSelected(null);
    setMovedThisTurn(false);
    setPlacing(false);
    setPendingPlacement(null);
    setError(null);
  }

  function togglePlacing() {
    if (movedThisTurn) return;
    setPlacing((p) => !p);
    setSelected(null);
    setPendingPlacement(null);
  }

  // Pijltjestoetsen bewegen het geselecteerde stuk, Enter bevestigt (zelfde
  // als de STOP-knop).
  useEffect(() => {
    function onKeyDown(e) {
      if (viewingHistory || !isMyTurn) return;
      const dirByKey = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
      if (dirByKey[e.key]) {
        if (!selected || placing) return;
        e.preventDefault();
        handleMove(dirByKey[e.key]);
      } else if (e.key === "Enter") {
        if (!selected || !movedThisTurn) return;
        e.preventDefault();
        endTurn();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewingHistory, isMyTurn, selected, placing, movedThisTurn, state]);

  function resign() {
    if (!myRole || !state || state.winner) return;
    if (!window.confirm(t("game.resign.confirm"))) return;
    const opp = effectiveRole === "A" ? "B" : "A";
    const nextState = {
      ...state,
      winner: opp,
      log: [{ key: "resign", role: effectiveRole }, ...state.log].slice(0, 40),
    };
    pushState(nextState, "finished");
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ inline: "end", block: "nearest" });
  }, [historyIndex, history.length]);

  function openChat() {
    setLastSeenCount(messages.length);
    setChatOpen(true);
  }

  async function sendMessage(e) {
    e.preventDefault();
    const body = chatText.trim();
    if (!body || !myRole) return;
    setSendingChat(true);
    setChatError(null);
    const { error } = await supabase.from("game_messages").insert({ game_id: id, sender_id: user.id, body });
    setSendingChat(false);
    if (error) { setChatError(t("game.error.sendFailed", { message: error.message })); return; }
    setChatText("");
  }

  async function archiveMatch() {
    setArchiving(true);
    setArchiveError(null);
    const { error } = await supabase.from("archived_games").insert({ user_id: user.id, game_id: id });
    setArchiving(false);
    if (error && error.code !== "23505") {
      setArchiveError(t("game.error.archiveFailed", { message: error.message }));
      return;
    }
    setArchived(true);
  }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><BoardLoader /></main>;
  if (error && !state) return <main className="min-h-screen flex items-center justify-center">{error}</main>;
  if (!state) return null;

  // Bij lokaal pass-and-play is er geen "ik" die wint of verliest — beide
  // kanten zitten bij dezelfde speler, dus de winst wordt gewoon gevierd.
  const wonForMe = game.local_multiplayer ? !!state.winner : myRole === state.winner;

  // Cellen die het geselecteerde stuk in één richting kan bereiken —
  // gemarkeerd op het bord zodat je er ook rechtstreeks op kunt tikken,
  // als alternatief voor de pijltjesknoppen (vooral fijn op mobiel, waar
  // die knoppen ruimte kosten die er niet altijd is).
  const moveTargets = (!viewingHistory && isMyTurn && !placing && selected)
    ? Object.keys(DIRS)
        .map((dir) => {
          const result = applyMove(state, effectiveRole, [selected.r, selected.c], dir, false);
          return result.ok ? { r: result.dest[0], c: result.dest[1], dir } : null;
        })
        .filter(Boolean)
    : [];

  const unreadCount = Math.max(0, messages.length - lastSeenCount);

  return (
    <main className="min-h-screen px-4 py-8 flex flex-col items-center gap-6 game-page-main">
      {showOverlay && state.winner && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem",
          }}
        >
          {myRole && wonForMe && <Confetti />}
          <div
            className="panel win-panel"
            style={{
              maxWidth: 360, width: "100%", textAlign: "center", display: "flex", flexDirection: "column", gap: 16,
              position: "relative", zIndex: 61, animation: "win-title-pop 420ms ease-out both",
            }}
          >
            {myRole && wonForMe && (
              <div className="win-trophy-glow">
                <Trophy size={40} style={{ color: "var(--accent)" }} />
              </div>
            )}
            <h2 className="text-lg font-extrabold uppercase tracking-widest">
              {!myRole
                ? t("game.winner.matchEnded")
                : game.local_multiplayer
                  ? t("game.winner.wonBy", { name: nameFor(state.winner) })
                  : myRole === state.winner
                    ? t("game.winner.youWon")
                    : t("game.winner.youLost")}
            </h2>
            {!game.vs_computer && !game.local_multiplayer && myRole && playerRatings[myRole] != null && (
              <p className="text-sm mono" style={{ color: "var(--muted)" }}>
                {t("game.newRating", { value: playerRatings[myRole] })}
                {ratingDelta?.[myRole] != null && (
                  <span style={{ color: ratingDelta[myRole] >= 0 ? "#9db98a" : "#e07a5f" }}>
                    {" "}({ratingDelta[myRole] >= 0 ? "+" : ""}{ratingDelta[myRole]})
                  </span>
                )}
              </p>
            )}
            {archiveError && <p className="text-xs" style={{ color: "#e07a5f" }}>{archiveError}</p>}
            {myRole && (
              <button className="btn" onClick={archiveMatch} disabled={archiving || archived}>
                <Archive size={15} /> {archived ? t("game.archived") : archiving ? t("common.busy") : t("game.archiveGame")}
              </button>
            )}
            <button className="btn btn-solid" onClick={() => router.push("/lobby")}>{t("game.backToLobby")}</button>
          </div>
        </div>
      )}

      {!myRole && (
        <p className="text-sm flex items-center gap-2" style={{ color: "var(--muted)" }}>
          <Eye size={15} /> {t("game.spectator")}
        </p>
      )}

      {game.vs_computer && (
        <p
          className="text-xs flex items-center gap-2"
          style={{ color: "#e0b24c", background: "rgba(224, 178, 76, 0.12)", border: "1px solid rgba(224, 178, 76, 0.3)", borderRadius: 8, padding: "6px 12px" }}
        >
          <TriangleAlert size={14} strokeWidth={2} />
          {t("lobby.modal.computer.betaWarning")}
        </p>
      )}

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <div className="flex flex-col items-center gap-4">
          <div style={{ position: "relative" }}>
            <Board
              board={displayBoard}
              selected={!viewingHistory ? selected : null}
              slideAnim={!viewingHistory ? slideAnim : null}
              interactive={isMyTurn && !viewingHistory}
              onCellClick={(r, c) => {
                if (placing) { handlePlaceCellTap(r, c); return; }
                const target = selected && moveTargets.find((t) => t.r === r && t.c === c);
                if (target) { handleMove(target.dir); return; }
                selectCell(r, c);
              }}
              moveTargets={moveTargets}
              pendingTool={pendingPlacement ? { r: pendingPlacement.r, c: pendingPlacement.c, owner: effectiveRole } : null}
              labelTopLeft={nameFor("B")}
              labelBottomRight={nameFor("A")}
            />
            {myRole && !state.winner && (
              <button className="btn btn-icon btn-danger board-resign-btn" onClick={resign} title={t("game.resign.tooltip")}>
                <Flag size={15} />
              </button>
            )}
          </div>

          {!viewingHistory && selected && isMyTurn && (
            <div className="flex flex-col items-center gap-1 hide-mobile">
              <div className="grid grid-cols-3 gap-1">
                <div />
                <DirBtn icon={ArrowUp} onClick={() => handleMove("up")} />
                <div />
                <DirBtn icon={ArrowLeft} onClick={() => handleMove("left")} />
                <button className="btn" onClick={endTurn} disabled={!movedThisTurn || !canStopHere} title={!canStopHere ? t("game.stopWouldEnclose") : undefined}><Square size={14} /> {t("game.stop")}</button>
                <DirBtn icon={ArrowRight} onClick={() => handleMove("right")} />
                <div />
                <DirBtn icon={ArrowDown} onClick={() => handleMove("down")} />
                <div />
              </div>
              {/* Zolang niks van deze beurt nog naar de server gepusht is,
                  mag je gewoon van gedachten veranderen — een ander stuk
                  kiezen, of alsnog een hulpstuk plaatsen. */}
              {movedThisTurn && (
                <button className="btn" onClick={cancelTurn}><RotateCcw size={14} /> {t("game.cancelTurn")}</button>
              )}
            </div>
          )}

          {/* Vaste actiebalk, alleen op mobiel (zie .game-action-bar in
              globals.css) — houdt de belangrijkste acties altijd binnen
              handbereik, zonder dat je naar beneden hoeft te scrollen. Op
              desktop blijven de pijltjesknoppen en de knop in het paneel
              hiernaast gewoon werken (zie hide-mobile hierboven/hieronder). */}
          {!viewingHistory && isMyTurn && (
            <div className="game-action-bar">
              {pendingPlacement ? (
                <>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{t("game.placeToolQuestion")}</p>
                  <div className="flex items-center gap-2">
                    <button className="btn btn-solid" style={{ flex: 1 }} onClick={confirmPlacement}><Check size={15} /> {t("common.confirm")}</button>
                    <button className="btn" style={{ flex: 1 }} onClick={cancelPlacement}><X size={15} /> {t("common.cancel")}</button>
                  </div>
                </>
              ) : placing ? (
                <>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{t("game.tapBoardToPlace")}</p>
                  <button className="btn" onClick={cancelPlacement}><X size={15} /> {t("common.cancel")}</button>
                </>
              ) : selected ? (
                <>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {moveTargets.length > 0 ? t("game.tapHighlightedToMove") : t("game.noMoveCancelOrStop")}
                  </p>
                  <div className="flex items-center gap-2">
                    {movedThisTurn && (
                      <button className="btn" style={{ flex: 1 }} onClick={cancelTurn}><RotateCcw size={14} /> {t("game.cancelTurnShort")}</button>
                    )}
                    <button
                      className="btn"
                      style={{ flex: 1 }}
                      onClick={endTurn}
                      disabled={!movedThisTurn || !canStopHere}
                      title={!canStopHere ? t("game.stopWouldEnclose") : undefined}
                    >
                      <Square size={14} /> {t("game.stop")}
                    </button>
                  </div>
                </>
              ) : (
                <button className="btn" onClick={togglePlacing} disabled={movedThisTurn || state.toolsRemaining[effectiveRole] <= 0}>
                  <ToolIcon /> {t("game.placeTool")}
                </button>
              )}
            </div>
          )}

          {/* Partijgeschiedenis als compacte, schaaknotatie-achtige strip
              (1. 3,4 3,7  2. ...) i.p.v. een losse schuifbalk of een apart
              tekstvlak met volledige zetbeschrijvingen — neemt veel minder
              ruimte in en toont meteen waar je in de partij zit. */}
          {rounds.length > 0 && (
            <div className="flex items-center gap-1" style={{ width: "min(88vw, 484px)" }}>
              <button className="btn btn-icon" onClick={stepHistoryBack} disabled={historyIndex === -1}><ChevronLeft size={16} /></button>
              <div className="move-strip">
                {rounds.map(([a, b], i) => (
                  <span key={i} className="move-strip-round">
                    <span className="move-strip-num">{i + 1}.</span>
                    {[a, b].map((turn, j) => {
                      if (!turn) return null;
                      const isActive = turn.endIndex === activeHistoryIndex;
                      return (
                        <button
                          key={j}
                          ref={isActive ? activeChipRef : undefined}
                          className={`move-strip-chip${isActive ? " active" : ""}`}
                          onClick={() => setHistoryIndex(turn.endIndex >= history.length - 1 ? null : turn.endIndex)}
                          title={turn.lastEntry.type === "tool" ? t("game.tool") : t("game.pawn")}
                        >
                          {turn.lastEntry.type === "tool" && "◆"}{turn.lastEntry.to[0]},{turn.lastEntry.to[1]}
                        </button>
                      );
                    })}
                  </span>
                ))}
              </div>
              <button className="btn btn-icon" onClick={stepHistoryForward} disabled={!viewingHistory}><ChevronRight size={16} /></button>
            </div>
          )}

          {myRole && !game.vs_computer && !game.local_multiplayer && (
            <button className="btn" onClick={openChat} style={{ position: "relative" }}>
              <MessageCircle size={15} /> {t("game.chat")}
              {unreadCount > 0 && <span className="notif-dot">{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>
          )}
        </div>

        <aside className="panel w-64 flex flex-col gap-3">
          <div className="text-xs flex items-center justify-between flex-wrap gap-1" style={{ color: "var(--muted)" }}>
            <span className="flex items-center gap-1">
              <Avatar username={playerNames.A} size={18} /> {nameFor("A")} <Rating value={playerRatings.A} />
              <span className="flex items-center gap-1 mono" title={t("game.tool")}>
                <ToolIcon size={11} /> {state.toolsRemaining.A}
              </span>
            </span>
            <span>{t("game.vs")}</span>
            <span className="flex items-center gap-1">
              <Avatar username={playerNames.B} size={18} /> {nameFor("B")} <Rating value={playerRatings.B} />
              <span className="flex items-center gap-1 mono" title={t("game.tool")}>
                <ToolIcon size={11} /> {state.toolsRemaining.B}
              </span>
            </span>
          </div>
          <p className="text-sm flex items-center gap-2">
            <Avatar username={nameFor(state.winner || state.turn)} size={22} />
            {state.winner
              ? t("game.winner.wonBy", { name: nameFor(state.winner) })
              : game.local_multiplayer
                ? t("game.playerIsUp", { name: nameFor(state.turn) })
                : isMyTurn ? t("game.youAreUp") : t("game.playerIsUp", { name: nameFor(state.turn) })}
          </p>
          {game.vs_computer && (
            <div className="text-xs mono" style={{ color: "var(--muted)" }}>
              {t("game.computerLabel", { difficulty: t(`lobby.difficulty.${game.difficulty}`) || game.difficulty })}
            </div>
          )}
          {pendingPlacement ? (
            <div className="hide-mobile flex items-center gap-2">
              <button className="btn btn-solid" onClick={confirmPlacement}><Check size={15} /> {t("common.confirm")}</button>
              <button className="btn" onClick={cancelPlacement}><X size={15} /> {t("common.cancel")}</button>
            </div>
          ) : (
            <button className="btn hide-mobile" onClick={togglePlacing} disabled={!isMyTurn || movedThisTurn || state.toolsRemaining[effectiveRole] <= 0}>
              <ToolIcon /> {placing ? t("game.cancelPlacing") : t("game.placeTool")}
            </button>
          )}
          {error && <p className="text-xs" style={{ color: "#e07a5f" }}>{error}</p>}
        </aside>
      </div>

      {/* Chat als knop + overlay i.p.v. een altijd-zichtbaar zijpaneel — dat
          paneel was op mobiel niet goed bereikbaar zonder te scrollen. */}
      {chatOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem",
          }}
        >
          <div className="panel" style={{ maxWidth: 420, width: "100%", height: "min(80vh, 520px)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--accent)" }}>
                <MessageCircle size={15} /> {t("game.chat")}
              </h2>
              <button className="btn btn-icon" onClick={() => setChatOpen(false)}><X size={16} /></button>
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto flex-1">
              {messages.length === 0 && (
                <p className="text-xs" style={{ color: "var(--muted)" }}>{t("game.noMessagesYet")}</p>
              )}
              {messages.map((m) => (
                <div key={m.id} className="text-xs flex items-start gap-2">
                  <Avatar username={m.profiles?.username} size={20} />
                  <div>
                    <div className="mono" style={{ color: "var(--muted)" }}>{m.profiles?.username || t("common.unknown")}</div>
                    <div>{m.body}</div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            {chatError && <p className="text-xs" style={{ color: "#e07a5f" }}>{chatError}</p>}
            <form onSubmit={sendMessage} className="flex items-center gap-2">
              <input
                type="text"
                className="input flex-1"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder={t("game.chatPlaceholder")}
                maxLength={500}
                autoFocus
              />
              <button className="btn btn-icon" type="submit" disabled={sendingChat || !chatText.trim()}>
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

