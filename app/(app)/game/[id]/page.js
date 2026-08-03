"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Square, Trophy, Flag, Archive,
  ChevronLeft, ChevronRight, RotateCcw, Hammer, Eye, MessageCircle, Send,
} from "lucide-react";
import { SIZE, CENTER, DIRS, isCenter, slide, applyMove, applyPlaceTool, reconstructBoard } from "@/lib/collisionEngine";
import { Avatar } from "@/lib/ui";

// Vergelijkt twee bordstaten en vindt het ene stuk dat verplaatst is (indien
// van toepassing), zodat we dat kunnen laten "schuiven" i.p.v. laten
// verspringen. Een hulpstuk dat nieuw verschijnt (plaatsen, geen from-cel)
// levert bewust geen match op — dat is geen verplaatsing.
function diffMove(prevBoard, nextBoard) {
  let from = null;
  let to = null;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const before = prevBoard[r][c];
      const after = nextBoard[r][c];
      if (before && !after) from = { r, c, piece: before };
      if (!before && after) to = { r, c, piece: after };
    }
  }
  if (from && to && from.piece.type === to.piece.type && from.piece.owner === to.piece.owner) {
    return { from, to, piece: from.piece };
  }
  return null;
}

function Confetti() {
  // Lazy initializer: draait maar één keer (bij mount), dus de
  // willekeurigheid hier levert een stabiele waarde op voor de levensduur
  // van dit component-exemplaar, i.p.v. instabiele waarden per render.
  const [pieces] = useState(() => {
    const colors = ["var(--gold)", "var(--maple)", "var(--walnut)", "#e07a5f", "#f0ece2"];
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
  const [movedThisTurn, setMovedThisTurn] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOverlay, setShowOverlay] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archived, setArchived] = useState(false);
  const [archiveError, setArchiveError] = useState(null);
  const [slideAnim, setSlideAnim] = useState(null);
  const [playerNames, setPlayerNames] = useState({ A: null, B: null });
  const [historyIndex, setHistoryIndex] = useState(null); // null = live, anders index in state.history
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [chatError, setChatError] = useState(null);
  const prevBoardRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    let channel;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);

      const { data, error } = await supabase
        .from("games")
        .select("*, a:player_a(username), b:player_b(username)")
        .eq("id", id)
        .single();
      if (error || !data) { setError("Partij niet gevonden."); setLoading(false); return; }
      setGame(data);
      setPlayerNames({ A: data.a?.username || null, B: data.b?.username || null });
      const role = data.player_a === user.id ? "A" : data.player_b === user.id ? "B" : null;
      setMyRole(role);
      setLoading(false);

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
              if (!prev?.state?.winner && payload.new?.state?.winner) setShowOverlay(true);
              return payload.new;
            });
            setSelected(null);
            setMovedThisTurn(false);
            setPlacing(false);
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
  const isMyTurn = state && myRole && state.turn === myRole && !state.winner;
  const nameFor = (role) => playerNames[role] || `Speler ${role}`;
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

  function selectCell(r, c) {
    if (viewingHistory || !isMyTurn || placing) return;
    const cell = state.board[r][c];
    if (!cell || cell.owner !== myRole) return;
    if (movedThisTurn && !(selected && selected.r === r && selected.c === c)) return;
    setSelected({ r, c, type: cell.type });
  }

  function handlePlaceClick(r, c) {
    if (viewingHistory || !isMyTurn || !placing) return;
    const result = applyPlaceTool(state, myRole, r, c);
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    pushState(result.state);
  }

  function handleMove(dir) {
    if (!isMyTurn || !selected) return;
    const result = applyMove(state, myRole, [selected.r, selected.c], dir, false);
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
    const opp = myRole === "A" ? "B" : "A";
    pushState({ ...state, turn: opp });
  }

  function togglePlacing() {
    if (movedThisTurn) return;
    setPlacing((p) => !p);
    setSelected(null);
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
    const opp = myRole === "A" ? "B" : "A";
    const nextState = {
      ...state,
      winner: opp,
      log: [`Speler ${myRole} heeft opgegeven.`, ...state.log].slice(0, 40),
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

  if (loading) return <main className="min-h-screen flex items-center justify-center">Laden...</main>;
  if (error && !state) return <main className="min-h-screen flex items-center justify-center">{error}</main>;
  if (!state) return null;

  return (
    <main className="min-h-screen px-4 py-8 flex flex-col items-center gap-6">
      {showOverlay && state.winner && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem",
          }}
        >
          {myRole && myRole === state.winner && <Confetti />}
          <div
            className="panel"
            style={{
              maxWidth: 360, width: "100%", textAlign: "center", display: "flex", flexDirection: "column", gap: 16,
              position: "relative", zIndex: 61, animation: "win-title-pop 420ms ease-out both",
            }}
          >
            {myRole && myRole === state.winner && (
              <Trophy size={40} style={{ margin: "0 auto", color: "var(--gold)" }} />
            )}
            <h2 className="text-lg font-extrabold uppercase tracking-widest">
              {!myRole
                ? "De match is beëindigd"
                : myRole === state.winner
                  ? "Je hebt gewonnen!"
                  : "Je hebt verloren"}
            </h2>
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

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <div className="flex flex-col items-center gap-4">
          <div
            className="grid"
            style={{
              position: "relative",
              gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
              gridTemplateRows: `repeat(${SIZE}, 1fr)`,
              width: "min(88vw, 484px)",
              height: "min(88vw, 484px)",
              border: "10px solid var(--walnut)",
              overflow: "hidden",
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            }}
          >
            {Array.from({ length: SIZE }).map((_, r) =>
              Array.from({ length: SIZE }).map((_, c) => {
                const cell = displayBoard[r][c];
                const center = isCenter(r, c);
                const isSel = !viewingHistory && selected && selected.r === r && selected.c === c;
                const isSlideTarget = !viewingHistory && slideAnim && slideAnim.to.r === r && slideAnim.to.c === c;
                return (
                  <div
                    key={`${r}-${c}`}
                    onClick={() => (placing ? handlePlaceClick(r, c) : selectCell(r, c))}
                    style={{
                      position: "relative",
                      background: center
                        ? "var(--board-dark)"
                        : (r + c) % 2 === 0 ? "var(--board-dark)" : "var(--board-light)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: isMyTurn && !viewingHistory ? "pointer" : "default",
                    }}
                  >
                    {center && (
                      <div style={{
                        position: "absolute", width: "60%", height: "60%",
                        border: "2px solid var(--gold)", borderRadius: "50%", opacity: 0.55,
                      }} />
                    )}
                    {cell && !isSlideTarget && (
                      <div style={{
                        width: cell.type === "pawn" ? "62%" : "38%",
                        height: cell.type === "pawn" ? "62%" : "38%",
                        borderRadius: cell.type === "pawn" ? "50%" : "3px",
                        transform: cell.type === "tool" ? "rotate(45deg)" : "none",
                        background: cell.owner === "A" ? "var(--walnut)" : "var(--maple)",
                        boxShadow: isSel ? "0 0 0 2px var(--gold)" : "0 1px 3px rgba(0,0,0,0.35)",
                      }} />
                    )}
                  </div>
                );
              })
            )}

            {!viewingHistory && slideAnim && (
              <div
                style={{
                  position: "absolute",
                  top: `${((slideAnim.animating ? slideAnim.to.r : slideAnim.from.r) / SIZE) * 100}%`,
                  left: `${((slideAnim.animating ? slideAnim.to.c : slideAnim.from.c) / SIZE) * 100}%`,
                  width: `${100 / SIZE}%`,
                  height: `${100 / SIZE}%`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "top 240ms ease, left 240ms ease",
                  pointerEvents: "none",
                }}
              >
                <div style={{
                  width: slideAnim.piece.type === "pawn" ? "62%" : "38%",
                  height: slideAnim.piece.type === "pawn" ? "62%" : "38%",
                  borderRadius: slideAnim.piece.type === "pawn" ? "50%" : "3px",
                  transform: slideAnim.piece.type === "tool" ? "rotate(45deg)" : "none",
                  background: slideAnim.piece.owner === "A" ? "var(--walnut)" : "var(--maple)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
                }} />
              </div>
            )}
          </div>

          {!viewingHistory && selected && isMyTurn && (
            <div className="grid grid-cols-3 gap-1">
              <div />
              <DirBtn icon={ArrowUp} onClick={() => handleMove("up")} />
              <div />
              <DirBtn icon={ArrowLeft} onClick={() => handleMove("left")} />
              <button className="btn" onClick={endTurn} disabled={!movedThisTurn}><Square size={14} /> STOP</button>
              <DirBtn icon={ArrowRight} onClick={() => handleMove("right")} />
              <div />
              <DirBtn icon={ArrowDown} onClick={() => handleMove("down")} />
              <div />
            </div>
          )}

          {history.length > 0 && (
            <div className="flex flex-col items-center gap-1">
              {viewingHistory && (
                <p className="text-xs" style={{ color: "var(--gold)" }}>
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
          <p className="text-sm flex items-center gap-2">
            <Avatar username={nameFor(state.winner || state.turn)} size={22} />
            {state.winner
              ? `${nameFor(state.winner)} heeft gewonnen!`
              : isMyTurn ? "Jij bent aan zet" : `${nameFor(state.turn)} is aan zet`}
          </p>
          <div className="text-xs mono" style={{ color: "var(--muted)" }}>
            <div>Hulpstukken A: {state.toolsRemaining.A}</div>
            <div>Hulpstukken B: {state.toolsRemaining.B}</div>
          </div>
          <button className="btn" onClick={togglePlacing} disabled={!isMyTurn || movedThisTurn || state.toolsRemaining[myRole] <= 0}>
            <Hammer size={15} /> {placing ? "Annuleer plaatsen" : "Plaats hulpstuk"}
          </button>
          {myRole && !state.winner && (
            <button className="btn btn-danger" onClick={resign}><Flag size={15} /> Opgeven</button>
          )}
          {error && <p className="text-xs" style={{ color: "#e07a5f" }}>{error}</p>}
          <div className="text-xs mono flex flex-col gap-1 max-h-48 overflow-y-auto border-t pt-2" style={{ borderColor: "var(--panel-line)", color: "var(--muted)" }}>
            {state.log.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </aside>

        {myRole && (
          <aside className="panel w-64 flex flex-col gap-3" style={{ height: 420 }}>
            <h2 className="text-sm uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--gold)" }}>
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

function DirBtn({ icon: Icon, onClick }) {
  return <button className="btn btn-icon" onClick={onClick}><Icon size={16} /></button>;
}
