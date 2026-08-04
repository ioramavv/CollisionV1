"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Square, Trophy, RotateCcw,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { freshState, applyMove, applyPlaceTool, bothPawnsCanReachCenter } from "@/lib/collisionEngine";
import { chooseComputerTurn } from "@/lib/collisionAI";
import { DirBtn, ToolIcon } from "@/lib/ui";
import Board, { diffMove } from "@/lib/Board";

// Uitlegpagina: een echte, volledig lokale oefenpartij tegen de computer
// (Makkelijk) — niets wordt opgeslagen in Supabase, dus er is niets om op
// te ruimen en "opnieuw beginnen" is gewoon de state resetten. De tips
// lopen mee met wat er daadwerkelijk op het bord gebeurt, in plaats van een
// vaste diashow met nagemaakte voorbeelden.
const STEPS = [
  {
    text: "Dit is jouw pion, linksboven (uitgelicht). Klik erop om 'm te selecteren.",
    done: (ctx) => !!ctx.selected,
  },
  {
    text: "Kies nu een richting. Je pion stuitert door tot-ie ergens tegenaan botst — de rand, het centrum, of een ander stuk.",
    done: (ctx) => ctx.movedThisTurn,
  },
  {
    text: "Je mag met hetzelfde stuk nog een keer stuiteren (ook een andere richting), of op STOP drukken om je beurt te beëindigen.",
    done: (ctx) => ctx.turnEnded,
  },
  {
    text: "Nu is de computer aan zet — te zien aan de kleurstip naast zijn naam hierboven.",
    done: (ctx) => ctx.state.turn === "A",
  },
  {
    text: "Je hebt ook 5 hulpstukken. Die kun je neerzetten om een pad te blokkeren of jezelf te beschermen — klik op \"Plaats hulpstuk\".",
    done: (ctx) => ctx.state.toolsRemaining.A < 5 || ctx.placing,
  },
  {
    text: "Let op: een zet mag nooit een pion (van wie dan ook) volledig van het centrum afsluiten — het spel weigert zo'n zet automatisch.",
    done: () => false,
  },
  {
    text: "Dat is alles! Bereik als eerste met je pion het centrum om te winnen. Speel gewoon verder, of begin opnieuw.",
    done: () => false,
  },
];

export default function TutorialPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [state, setState] = useState(() => freshState());
  const [selected, setSelected] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [movedThisTurn, setMovedThisTurn] = useState(false);
  const [turnEnded, setTurnEnded] = useState(false);
  const [error, setError] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [slideAnim, setSlideAnim] = useState(null);
  const computerTurnRef = useRef(false);
  const stateRef = useRef(state);
  const prevBoardRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setCheckingAuth(false);
    })();
  }, [router]);

  useEffect(() => { stateRef.current = state; }, [state]);

  // Detecteert welk stuk verplaatst is (t.o.v. de vorige bordstaat) en laat
  // dat kort "schuiven" — dezelfde animatie als op de echte spelpagina.
  useEffect(() => {
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
  }, [state.board]);

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

  // Laat de computer (rol B, Makkelijk) automatisch spelen zodra hij aan
  // zet is. Volledig lokaal, dus geen race-conditions tussen clients zoals
  // bij een echte partij nodig is af te vangen — wel dezelfde primitieve
  // dependency-array + stateRef-truc als de echte spelpagina, anders zou
  // elke tussenliggende zet (voor de schuifanimatie) dit effect opnieuw
  // laten opstarten en zichzelf meteen afbreken.
  useEffect(() => {
    if (state.turn !== "B" || state.winner) return;
    if (computerTurnRef.current) return;
    computerTurnRef.current = true;
    let cancelled = false;

    (async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const startState = stateRef.current;
      if (cancelled || !startState) { computerTurnRef.current = false; return; }

      const action = chooseComputerTurn(startState, "B", "easy");
      if (!action) {
        if (!cancelled) setState({ ...startState, turn: "A" });
        computerTurnRef.current = false;
        return;
      }

      if (action.type === "place") {
        const result = applyPlaceTool(startState, "B", action.r, action.c);
        if (!cancelled) setState(result.ok ? result.state : { ...startState, turn: "A" });
        computerTurnRef.current = false;
        return;
      }

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
        setState(cur);
        if (result.winningMove) break;
        if (!isLast) await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!movedAny && !cancelled) setState({ ...startState, turn: "A" });
      computerTurnRef.current = false;
    })();

    return () => { cancelled = true; };
  }, [state.turn, state.winner]);

  const isMyTurn = state.turn === "A" && !state.winner;
  const canStopHere = bothPawnsCanReachCenter(state.board, state.pawnPos);

  function selectCell(r, c) {
    if (!isMyTurn || placing) return;
    const cell = state.board[r][c];
    if (!cell || cell.owner !== "A") return;
    if (movedThisTurn && !(selected && selected.r === r && selected.c === c)) return;
    setSelected({ r, c, type: cell.type });
  }

  function handlePlaceClick(r, c) {
    if (!isMyTurn || !placing) return;
    const result = applyPlaceTool(state, "A", r, c);
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    setPlacing(false);
    setState(result.state);
  }

  function handleMove(dir) {
    if (!isMyTurn || !selected) return;
    const result = applyMove(state, "A", [selected.r, selected.c], dir, false);
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    setState(result.state);
    if (result.winningMove) return;
    setSelected({ r: result.dest[0], c: result.dest[1], type: selected.type });
    setMovedThisTurn(true);
    if (result.turnEnded) setTurnEnded(true);
  }

  function endTurn() {
    if (!selected) return;
    if (!bothPawnsCanReachCenter(state.board, state.pawnPos)) {
      setError("Je kunt hier niet stoppen — dit zou een pion volledig insluiten. Beweeg verder.");
      return;
    }
    setError(null);
    setTurnEnded(true);
    setState((s) => ({ ...s, turn: "B" }));
  }

  function togglePlacing() {
    if (movedThisTurn) return;
    setPlacing((p) => !p);
    setSelected(null);
  }

  function restart() {
    setState(freshState());
    setSelected(null);
    setPlacing(false);
    setMovedThisTurn(false);
    setTurnEnded(false);
    setError(null);
    setStepIndex(0);
    setSlideAnim(null);
    computerTurnRef.current = false;
  }

  // Reset de per-beurt UI-state zodra het weer aan A is — aangepast tijdens
  // render (i.p.v. in een effect) zodra `state.turn` daadwerkelijk wijzigt,
  // zoals React aanbeveelt voor dit soort "state aanpassen bij wijziging".
  const [prevTurn, setPrevTurn] = useState(state.turn);
  if (state.turn !== prevTurn) {
    setPrevTurn(state.turn);
    if (state.turn === "A") {
      setMovedThisTurn(false);
      setTurnEnded(false);
      setPlacing(false);
      setSelected(null);
    }
  }

  // Idem voor het automatisch doorschakelen van de tutorial-stap: zodra de
  // conditie van de huidige stap waar wordt, gaan we (tijdens render) door
  // naar de volgende. Dat stopt vanzelf zodra de conditie van de nieuwe
  // huidige stap nog niet vervuld is, dus dit blijft niet doorlopen.
  const currentStep = STEPS[stepIndex];
  if (currentStep && stepIndex < STEPS.length - 1 && currentStep.done({ selected, movedThisTurn, turnEnded, placing, state })) {
    setStepIndex(stepIndex + 1);
  }

  const highlightPawn = stepIndex === 0 && !selected ? { r: state.pawnPos.A[0], c: state.pawnPos.A[1] } : null;

  if (checkingAuth) return <main className="min-h-screen flex items-center justify-center">Laden...</main>;

  return (
    <main className="min-h-screen px-4 py-8 flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2 text-center" style={{ maxWidth: 480 }}>
        <h1 className="text-xl font-extrabold uppercase tracking-widest">Uitleg</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Het beste leer je Collision door het te spelen. Hieronder speel je een echte oefenpartij
          tegen de computer (Makkelijk) — niets wordt opgeslagen, dus experimenteer gerust. Volg de tips.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <div className="flex flex-col items-center gap-4">
          {currentStep && (
            <div
              style={{
                width: "min(88vw, 484px)",
                background: "#fff",
                color: "#111",
                borderRadius: 8,
                padding: "12px 16px",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
              }}
            >
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, flexShrink: 0, color: "#111" }}>
                Tip
              </span>
              <p style={{ fontSize: 14, flex: 1, margin: 0, color: "#111" }}>{currentStep.text}</p>
              {stepIndex < STEPS.length - 1 && (
                <button className="btn btn-icon" onClick={() => setStepIndex((i) => i + 1)} title="Volgende tip" style={{ flexShrink: 0 }}>
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}

          <Board
            board={state.board}
            selected={selected}
            slideAnim={slideAnim}
            interactive={isMyTurn}
            highlight={highlightPawn}
            onCellClick={(r, c) => (placing ? handlePlaceClick(r, c) : selectCell(r, c))}
            labelTopLeft="Jij"
            labelBottomRight="Computer"
          />

          {selected && isMyTurn && (
            <div className="grid grid-cols-3 gap-1">
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
        </div>

        <aside className="panel w-64 flex flex-col gap-3">
          <div className="text-xs mono flex flex-col gap-1" style={{ color: "var(--muted)" }}>
            <div>Jij — hulpstukken: {state.toolsRemaining.A}</div>
            <div>Computer — hulpstukken: {state.toolsRemaining.B}</div>
          </div>

          {state.winner ? (
            <p className="text-sm flex items-center gap-2">
              <Trophy size={16} style={{ color: "var(--accent)" }} />
              {state.winner === "A" ? "Je hebt gewonnen!" : "De computer heeft gewonnen."}
            </p>
          ) : (
            <p className="text-sm">
              {isMyTurn ? "Jij bent aan zet" : "Computer is aan zet"}
            </p>
          )}

          <button className="btn" onClick={togglePlacing} disabled={!isMyTurn || movedThisTurn || state.toolsRemaining.A <= 0}>
            <ToolIcon /> {placing ? "Annuleer plaatsen" : "Plaats hulpstuk"}
          </button>
          <button className="btn" onClick={restart}><RotateCcw size={15} /> Opnieuw beginnen</button>
          {error && <p className="text-xs" style={{ color: "#e07a5f" }}>{error}</p>}
        </aside>
      </div>
    </main>
  );
}
