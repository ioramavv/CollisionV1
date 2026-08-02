"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { SIZE, CENTER, DIRS, isCenter, slide, applyMove, applyPlaceTool } from "@/lib/collisionEngine";

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

  useEffect(() => {
    let channel;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);

      const { data, error } = await supabase.from("games").select("*").eq("id", id).single();
      if (error || !data) { setError("Partij niet gevonden."); setLoading(false); return; }
      setGame(data);
      setMyRole(data.player_a === user.id ? "A" : data.player_b === user.id ? "B" : null);
      setLoading(false);

      channel = supabase
        .channel(`game-${id}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${id}` },
          (payload) => {
            setGame(payload.new);
            setSelected(null);
            setMovedThisTurn(false);
            setPlacing(false);
          }
        )
        .subscribe();
    }

    init();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [id, router]);

  const state = game?.state;
  const isMyTurn = state && myRole && state.turn === myRole && !state.winner;

  const pushState = useCallback(async (nextState) => {
    const { error } = await supabase.from("games").update({ state: nextState }).eq("id", id);
    if (error) setError(error.message);
  }, [id]);

  function selectCell(r, c) {
    if (!isMyTurn || placing) return;
    const cell = state.board[r][c];
    if (!cell || cell.owner !== myRole) return;
    if (movedThisTurn && !(selected && selected.r === r && selected.c === c)) return;
    setSelected({ r, c, type: cell.type });
  }

  function handlePlaceClick(r, c) {
    if (!isMyTurn || !placing) return;
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
    if (result.winningMove) { pushState(result.state); return; }
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

  if (loading) return <main className="min-h-screen flex items-center justify-center">Laden...</main>;
  if (error && !state) return <main className="min-h-screen flex items-center justify-center">{error}</main>;
  if (!state) return null;

  return (
    <main className="min-h-screen px-4 py-8 flex flex-col items-center gap-6">
      <div className="w-full flex items-center justify-between max-w-md">
        <button className="btn" onClick={() => router.push("/lobby")}>← Lobby</button>
        <h1 className="text-lg font-extrabold uppercase tracking-widest">
          Colli<span style={{ color: "var(--gold)" }}>sion</span>
        </h1>
        <div style={{ width: "5.5rem" }} />
      </div>

      {!myRole && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Je kijkt toe als toeschouwer — je bent geen speler in deze partij.
        </p>
      )}

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <div className="flex flex-col items-center gap-4">
          <div
            className="grid"
            style={{
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
                const cell = state.board[r][c];
                const center = isCenter(r, c);
                const isSel = selected && selected.r === r && selected.c === c;
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
                      cursor: isMyTurn ? "pointer" : "default",
                    }}
                  >
                    {center && (
                      <div style={{
                        position: "absolute", width: "60%", height: "60%",
                        border: "2px solid var(--gold)", borderRadius: "50%", opacity: 0.55,
                      }} />
                    )}
                    {cell && (
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
          </div>

          {selected && isMyTurn && (
            <div className="grid grid-cols-3 gap-1">
              <div />
              <DirBtn label="▲" onClick={() => handleMove("up")} />
              <div />
              <DirBtn label="◀" onClick={() => handleMove("left")} />
              <button className="btn" onClick={endTurn} disabled={!movedThisTurn}>STOP</button>
              <DirBtn label="▶" onClick={() => handleMove("right")} />
              <div />
              <DirBtn label="▼" onClick={() => handleMove("down")} />
              <div />
            </div>
          )}
        </div>

        <aside className="panel w-64 flex flex-col gap-3">
          <p className="text-sm">
            {state.winner
              ? `Speler ${state.winner} heeft gewonnen!`
              : isMyTurn ? "Jij bent aan zet" : `Speler ${state.turn} is aan zet`}
          </p>
          <div className="text-xs mono" style={{ color: "var(--muted)" }}>
            <div>Hulpstukken A: {state.toolsRemaining.A}</div>
            <div>Hulpstukken B: {state.toolsRemaining.B}</div>
          </div>
          <button className="btn" onClick={togglePlacing} disabled={!isMyTurn || movedThisTurn || state.toolsRemaining[myRole] <= 0}>
            {placing ? "Annuleer plaatsen" : "Plaats hulpstuk"}
          </button>
          {error && <p className="text-xs" style={{ color: "#e07a5f" }}>{error}</p>}
          <div className="text-xs mono flex flex-col gap-1 max-h-48 overflow-y-auto border-t pt-2" style={{ borderColor: "var(--panel-line)", color: "var(--muted)" }}>
            {state.log.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </aside>
      </div>
    </main>
  );
}

function DirBtn({ label, onClick }) {
  return <button className="btn" onClick={onClick}>{label}</button>;
}
