"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Square, Trophy, Flag, Archive,
  ChevronLeft, ChevronRight, RotateCcw, Eye, MessageCircle, Send, TriangleAlert, Check, X,
} from "lucide-react";
import { applyMove, applyPlaceTool, reconstructBoard, bothPawnsCanReachCenter, DIRS } from "@/lib/collisionEngine";
import { chooseComputerTurn, DIFFICULTY_LABELS } from "@/lib/collisionAI";
import { Avatar, Rating, DirBtn, ToolIcon, BoardLoader } from "@/lib/ui";
import Board, { diffMove } from "@/lib/Board";

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
  const prevBoardRef = useRef(null);
  const chatEndRef = useRef(null);
  const computerTurnRef = useRef(false);
  const stateRef = useRef(null);
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
      if (error || !data) { setError("Partij niet gevonden."); setLoading(false); return; }
      setGame(data);
      if (data.local_multiplayer) {
        setPlayerNames({
          A: data.state?.localNames?.A || "Speler 1",
          B: data.state?.localNames?.B || "Speler 2",
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
      }

      channel = supabase
        .channel(`game-${id}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${id}` },
          (payload) => {
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
  const nameFor = (role) => playerNames[role] || `Speler ${role}`;
  const canStopHere = state ? bothPawnsCanReachCenter(state.board, state.pawnPos) : true;

  // Log-items zijn gestructureerd opgeslagen (niet als kant-en-klare tekst)
  // zodat ze hier met de actuele spelernamen getoond kunnen worden. Oudere,
  // al opgeslagen partijen kunnen nog platte strings bevatten — die tonen
  // we ongewijzigd.
  function formatLogEntry(entry) {
    if (typeof entry === "string") return entry;
    switch (entry.key) {
      case "start": return `Nieuw spel — ${nameFor("A")} begint (linksboven).`;
      case "place": return `${nameFor(entry.role)} plaatst een hulpstuk op (${entry.r},${entry.c}).`;
      case "move": return `${nameFor(entry.role)} beweegt ${entry.isPawn ? "de pion" : "een hulpstuk"} naar (${entry.r},${entry.c}).`;
      case "resign": return `${nameFor(entry.role)} heeft opgegeven.`;
      default: return "";
    }
  }

  const history = state?.history || [];
  const viewingHistory = historyIndex !== null;
  const displayBoard = viewingHistory ? reconstructBoard(history, historyIndex) : state?.board;

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

  useEffect(() => {
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
    const cell = state.board[r][c];
    if (!cell || cell.owner !== effectiveRole) return;
    if (movedThisTurn && !(selected && selected.r === r && selected.c === c)) return;
    setSelected({ r, c, type: cell.type });
  }

  // Tikken op een vakje tijdens het plaatsen zet alleen een preview neer
  // (pendingPlacement) — er wordt pas echt geplaatst (en de beurt
  // doorgegeven) als de speler dat expliciet bevestigt. Opnieuw tikken op
  // een ander geldig vakje verplaatst gewoon de preview.
  function handlePlaceCellTap(r, c) {
    if (viewingHistory || !isMyTurn || !placing) return;
    const result = applyPlaceTool(state, effectiveRole, r, c);
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    setPendingPlacement({ r, c });
  }

  function confirmPlacement() {
    if (!pendingPlacement || !state) return;
    const result = applyPlaceTool(state, effectiveRole, pendingPlacement.r, pendingPlacement.c);
    if (!result.ok) {
      // Zeldzaam: staat kan tussen preview en bevestiging gewijzigd zijn.
      setError(result.error);
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
    if (!result.ok) { setError(result.error); return; }
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
      setError("Je kunt hier niet stoppen — dit zou een pion volledig insluiten. Beweeg verder.");
      return;
    }
    setError(null);
    const opp = effectiveRole === "A" ? "B" : "A";
    pushState({ ...state, turn: opp });
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
    if (!window.confirm("Weet je zeker dat je wilt opgeven?")) return;
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

  async function sendMessage(e) {
    e.preventDefault();
    const body = chatText.trim();
    if (!body || !myRole) return;
    setSendingChat(true);
    setChatError(null);
    const { error } = await supabase.from("game_messages").insert({ game_id: id, sender_id: user.id, body });
    setSendingChat(false);
    if (error) { setChatError("Versturen mislukt: " + error.message); return; }
    setChatText("");
  }

  async function archiveMatch() {
    setArchiving(true);
    setArchiveError(null);
    const { error } = await supabase.from("archived_games").insert({ user_id: user.id, game_id: id });
    setArchiving(false);
    if (error && error.code !== "23505") {
      setArchiveError("Archiveren mislukt: " + error.message);
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
                ? "De match is beëindigd"
                : game.local_multiplayer
                  ? `${nameFor(state.winner)} heeft gewonnen!`
                  : myRole === state.winner
                    ? "Je hebt gewonnen!"
                    : "Je hebt verloren"}
            </h2>
            {!game.vs_computer && !game.local_multiplayer && myRole && playerRatings[myRole] != null && (
              <p className="text-sm mono" style={{ color: "var(--muted)" }}>
                Nieuwe rating: {playerRatings[myRole]}
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
                <Archive size={15} /> {archived ? "Gearchiveerd ✓" : archiving ? "Bezig..." : "Archiveer deze partij"}
              </button>
            )}
            <button className="btn btn-solid" onClick={() => router.push("/lobby")}>Terug naar lobby</button>
          </div>
        </div>
      )}

      {!myRole && (
        <p className="text-sm flex items-center gap-2" style={{ color: "var(--muted)" }}>
          <Eye size={15} /> Je kijkt toe als toeschouwer — je bent geen speler in deze partij.
        </p>
      )}

      {game.vs_computer && (
        <p
          className="text-xs flex items-center gap-2"
          style={{ color: "#e0b24c", background: "rgba(224, 178, 76, 0.12)", border: "1px solid rgba(224, 178, 76, 0.3)", borderRadius: 8, padding: "6px 12px" }}
        >
          <TriangleAlert size={14} strokeWidth={2} />
          Bèta: de computerspeler is nog in ontwikkeling en speelt niet altijd goed of foutloos.
        </p>
      )}

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <div className="flex flex-col items-center gap-4">
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
            labelTopLeft={nameFor("A")}
            labelBottomRight={nameFor("B")}
          />

          {!viewingHistory && selected && isMyTurn && (
            <div className="grid grid-cols-3 gap-1 hide-mobile">
              <div />
              <DirBtn icon={ArrowUp} onClick={() => handleMove("up")} />
              <div />
              <DirBtn icon={ArrowLeft} onClick={() => handleMove("left")} />
              <button className="btn" onClick={endTurn} disabled={!movedThisTurn || !canStopHere} title={!canStopHere ? "Hier stoppen zou een pion insluiten" : undefined}><Square size={14} /> STOP</button>
              <DirBtn icon={ArrowRight} onClick={() => handleMove("right")} />
              <div />
              <DirBtn icon={ArrowDown} onClick={() => handleMove("down")} />
              <div />
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
                  <p className="text-xs" style={{ color: "var(--muted)" }}>Hulpstuk plaatsen op dit vakje?</p>
                  <div className="flex items-center gap-2">
                    <button className="btn btn-solid" style={{ flex: 1 }} onClick={confirmPlacement}><Check size={15} /> Bevestig</button>
                    <button className="btn" style={{ flex: 1 }} onClick={cancelPlacement}><X size={15} /> Annuleren</button>
                  </div>
                </>
              ) : placing ? (
                <>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>Tik op het bord om een hulpstuk te plaatsen.</p>
                  <button className="btn" onClick={cancelPlacement}><X size={15} /> Annuleren</button>
                </>
              ) : selected ? (
                <>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {moveTargets.length > 0 ? "Tik op een gemarkeerd vakje om te bewegen." : "Geen zet mogelijk — probeer STOP of een ander stuk."}
                  </p>
                  <button
                    className="btn"
                    onClick={endTurn}
                    disabled={!movedThisTurn || !canStopHere}
                    title={!canStopHere ? "Hier stoppen zou een pion insluiten" : undefined}
                  >
                    <Square size={14} /> STOP
                  </button>
                </>
              ) : (
                <button className="btn" onClick={togglePlacing} disabled={movedThisTurn || state.toolsRemaining[effectiveRole] <= 0}>
                  <ToolIcon /> Plaats hulpstuk
                </button>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div className="flex flex-col items-center gap-1">
              {viewingHistory && (
                <p className="text-xs" style={{ color: "var(--accent)" }}>
                  Je bekijkt een eerdere situatie — puur ter inzage.
                </p>
              )}
              <div className="flex items-center gap-2">
                <button className="btn btn-icon" onClick={stepHistoryBack} disabled={historyIndex === -1}><ChevronLeft size={16} /></button>
                <span className="text-xs mono" style={{ color: "var(--muted)" }}>
                  {viewingHistory ? `Zet ${historyIndex + 1} / ${history.length}` : "Nu"}
                </span>
                <button className="btn btn-icon" onClick={stepHistoryForward} disabled={!viewingHistory}><ChevronRight size={16} /></button>
                {viewingHistory && (
                  <button className="btn btn-solid" onClick={() => setHistoryIndex(null)}>
                    <RotateCcw size={14} /> Terug naar nu
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="panel w-64 flex flex-col gap-3">
          <div className="text-xs flex items-center justify-between flex-wrap gap-1" style={{ color: "var(--muted)" }}>
            <span className="flex items-center gap-1">
              <Avatar username={playerNames.A} size={18} /> {nameFor("A")} <Rating value={playerRatings.A} />
            </span>
            <span>vs</span>
            <span className="flex items-center gap-1">
              <Avatar username={playerNames.B} size={18} /> {nameFor("B")} <Rating value={playerRatings.B} />
            </span>
          </div>
          <p className="text-sm flex items-center gap-2">
            <Avatar username={nameFor(state.winner || state.turn)} size={22} />
            {state.winner
              ? `${nameFor(state.winner)} heeft gewonnen!`
              : game.local_multiplayer
                ? `${nameFor(state.turn)} is aan zet`
                : isMyTurn ? "Jij bent aan zet" : `${nameFor(state.turn)} is aan zet`}
          </p>
          <div className="text-xs mono flex flex-col gap-1" style={{ color: "var(--muted)" }}>
            <div>{nameFor("A")} — hulpstukken: {state.toolsRemaining.A}</div>
            <div>{nameFor("B")} — hulpstukken: {state.toolsRemaining.B}</div>
            {game.vs_computer && <div>Computer: {DIFFICULTY_LABELS[game.difficulty] || game.difficulty}</div>}
          </div>
          {pendingPlacement ? (
            <div className="hide-mobile flex items-center gap-2">
              <button className="btn btn-solid" onClick={confirmPlacement}><Check size={15} /> Bevestig</button>
              <button className="btn" onClick={cancelPlacement}><X size={15} /> Annuleren</button>
            </div>
          ) : (
            <button className="btn hide-mobile" onClick={togglePlacing} disabled={!isMyTurn || movedThisTurn || state.toolsRemaining[effectiveRole] <= 0}>
              <ToolIcon /> {placing ? "Annuleer plaatsen" : "Plaats hulpstuk"}
            </button>
          )}
          {myRole && !state.winner && (
            <button className="btn btn-danger" onClick={resign}><Flag size={15} /> Opgeven</button>
          )}
          {error && <p className="text-xs" style={{ color: "#e07a5f" }}>{error}</p>}
          <div className="text-xs mono flex flex-col gap-1 max-h-48 overflow-y-auto border-t pt-2" style={{ borderColor: "var(--panel-line)", color: "var(--muted)" }}>
            {state.log.map((entry, i) => <div key={i}>{formatLogEntry(entry)}</div>)}
          </div>
        </aside>

        {myRole && !game.vs_computer && !game.local_multiplayer && (
          <aside className="panel w-64 flex flex-col gap-3" style={{ height: 420 }}>
            <h2 className="text-sm uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--accent)" }}>
              <MessageCircle size={15} /> Chat
            </h2>
            <div className="flex flex-col gap-3 overflow-y-auto flex-1">
              {messages.length === 0 && (
                <p className="text-xs" style={{ color: "var(--muted)" }}>Nog geen berichten — zeg hallo!</p>
              )}
              {messages.map((m) => (
                <div key={m.id} className="text-xs flex items-start gap-2">
                  <Avatar username={m.profiles?.username} size={20} />
                  <div>
                    <div className="mono" style={{ color: "var(--muted)" }}>{m.profiles?.username || "onbekend"}</div>
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
                placeholder="Typ een bericht..."
                maxLength={500}
              />
              <button className="btn btn-icon" type="submit" disabled={sendingChat || !chatText.trim()}>
                <Send size={15} />
              </button>
            </form>
          </aside>
        )}
      </div>
    </main>
  );
}

