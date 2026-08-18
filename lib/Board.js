"use client";
// Herbruikbaar spelbord — gebruikt door zowel de echte spelpagina als de
// uitlegpagina (tutorial), zodat een voorbeeld/oefenpartij er pixel-voor-
// pixel hetzelfde uitziet als een echte partij.

import { SIZE, isCenter } from "./collisionEngine";

// Vergelijkt twee bordstaten en vindt het ene stuk dat verplaatst is (indien
// van toepassing), zodat de aanroeper dat kan laten "schuiven" i.p.v. laten
// verspringen. Een hulpstuk dat nieuw verschijnt (plaatsen, geen from-cel)
// levert bewust geen match op — dat is geen verplaatsing.
export function diffMove(prevBoard, nextBoard) {
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

// Vergelijkt twee bordstaten en vindt een hulpstuk dat nieuw neergezet is
// (geen bijbehorend leeggekomen vakje elders, dus geen verplaatsing) — zodat
// de aanroeper daar een neerzet-animatie op kan laten spelen i.p.v. het stuk
// zomaar te laten verschijnen.
export function diffPlace(prevBoard, nextBoard) {
  let added = 0;
  let removed = 0;
  let to = null;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const before = prevBoard[r][c];
      const after = nextBoard[r][c];
      if (!before && after) { added++; to = { r, c, piece: after }; }
      if (before && !after) removed++;
    }
  }
  return added === 1 && removed === 0 ? to : null;
}

// Houtnerf-texturen voor het bord zelf — zelfde inline-SVG-fractal-noise-
// techniek als het Woody-thema, maar hier vast (niet per kleurthema), zodat
// het bord er in elk thema hetzelfde "echte houten spel" uitziet als op de
// foto's van het fysieke prototype: een massief lichte esdoorn speelvlak
// met een donkerder, walnoot-gekleurd omlijstend frame.
const FRAME_WOOD_TEXTURE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='700' height='700'%3E%3Cfilter id='w'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.006 0.09' numOctaves='3' seed='7' result='n'/%3E%3CfeColorMatrix in='n' type='matrix' values='0 0 0 0 0.15 0 0 0 0 0.08 0 0 0 0 0.03 0 0 0 0.35 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23w)'/%3E%3C/svg%3E\")";
const SURFACE_WOOD_TEXTURE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='700' height='700'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.004 0.08' numOctaves='3' seed='3' result='n'/%3E%3CfeColorMatrix in='n' type='matrix' values='0 0 0 0 0.55 0 0 0 0 0.4 0 0 0 0 0.22 0 0 0 0.22 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23m)'/%3E%3C/svg%3E\")";

// Eenmalige gradient-definities voor de stukken hieronder (Pawn/Tool) — één
// keer gerenderd voor het hele bord i.p.v. per stuk, met url(#id)-referenties
// erheen vanuit elk los stukje.
function PieceGradients() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <linearGradient id="collision-piece-maple-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#c9ab78" />
          <stop offset="45%" stopColor="#f1e3c2" />
          <stop offset="100%" stopColor="#a9895c" />
        </linearGradient>
        <linearGradient id="collision-piece-walnut-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2c1d12" />
          <stop offset="45%" stopColor="#5a3d26" />
          <stop offset="100%" stopColor="#1f140c" />
        </linearGradient>
        <radialGradient id="collision-piece-maple-head" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fbf1dd" />
          <stop offset="55%" stopColor="#e8d2a4" />
          <stop offset="100%" stopColor="#a9895c" />
        </radialGradient>
        <radialGradient id="collision-piece-walnut-head" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#6b4c30" />
          <stop offset="55%" stopColor="#3c2718" />
          <stop offset="100%" stopColor="#1a0f08" />
        </radialGradient>
      </defs>
    </svg>
  );
}

// Pion — getoond vanaf de zijkant (zoals op chess.com) i.p.v. recht van
// boven, met een brede voet, een getailleerde "nek" en een rond kopje, net
// als de echte gedraaide houten pionnen op het fysieke bord.
function Pawn({ owner }) {
  const body = owner === "A" ? "collision-piece-maple-body" : "collision-piece-walnut-body";
  const head = owner === "A" ? "collision-piece-maple-head" : "collision-piece-walnut-head";
  return (
    <svg viewBox="0 0 100 190" style={{ width: "100%", height: "auto", display: "block" }} aria-hidden="true">
      <ellipse cx="50" cy="184" rx="30" ry="7" fill="rgba(0,0,0,0.35)" />
      <path
        d="M28,182 C24,182 22,178 23,172 C25,158 30,146 30,132 C30,120 27,116 27,108
           C27,100 31,96 34,92 C29,86 27,78 27,70 C27,48 30,18 41,13 A11,9 0 0 1 59,13 C70,18 73,48 73,70
           C73,78 71,86 66,92 C69,96 73,100 73,108 C73,116 70,120 70,132
           C70,146 75,158 77,172 C78,178 76,182 72,182 Z"
        fill={`url(#${body})`}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="1"
      />
      <ellipse cx="50" cy="70" rx="19" ry="10" fill={`url(#${head})`} />
    </svg>
  );
}

// Hulpstuk — een kort, afgeplat kegeltje, net als de kleine houten stukjes
// op de foto's van het fysieke bord (in tegenstelling tot de langere pion).
function ToolPiece({ owner }) {
  const body = owner === "A" ? "collision-piece-maple-body" : "collision-piece-walnut-body";
  return (
    <svg viewBox="0 0 100 80" style={{ width: "100%", height: "auto", display: "block" }} aria-hidden="true">
      <ellipse cx="50" cy="75" rx="32" ry="6" fill="rgba(0,0,0,0.32)" />
      <path
        d="M16,72 C13,72 12,68 14,63 L30,20 C33,12 40,8 50,8 C60,8 67,12 70,20 L86,63
           C88,68 87,72 84,72 Z"
        fill={`url(#${body})`}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="1"
      />
      <ellipse cx="50" cy="10" rx="12" ry="5" fill="rgba(255,255,255,0.25)" />
    </svg>
  );
}

function PieceFor(type, owner) {
  return type === "pawn" ? <Pawn owner={owner} /> : <ToolPiece owner={owner} />;
}

// Hoogte die gereserveerd wordt boven/onder het bord voor een naamplaat
// (label + luchtje eromheen) — als echte layoutruimte, niet als iets dat
// over de rand heen hangt, anders overlapt het op kleinere (mobiele)
// bordformaten alsnog met het bord zelf.
const LABEL_SPACE = 34;

// labelTopLeft/labelBottomRight: naam van de walnoot- resp. maple-speler,
// getoond in een vlak van hun eigen stukkleur boven resp. onder het bord —
// precies aan de kant waar hun pion ook start, zodat de koppeling
// kleur-naam zo direct mogelijk is.
// moveTargets: [{r,c}] — vakjes die het geselecteerde stuk in één richting
// kan bereiken; getoond als aantikbare stip, zodat je er (i.p.v. via
// pijltjesknoppen) ook rechtstreeks op kunt tikken.
// pendingTool: {r,c,owner} — een hulpstuk-plaatsing die nog niet bevestigd
// is; getoond als een pulserende "ghost" op dat vakje.
// placeAnim: {r,c} — een hulpstuk dat zojuist daadwerkelijk neergezet is;
// speelt eenmalig een korte "pop"-animatie i.p.v. instant te verschijnen.
export default function Board({ board, selected, slideAnim, placeAnim, interactive, onCellClick, highlight, labelTopLeft, labelBottomRight, moveTargets, pendingTool }) {
  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        paddingTop: labelTopLeft ? LABEL_SPACE : 0,
        paddingBottom: labelBottomRight ? LABEL_SPACE : 0,
      }}
    >
      <PieceGradients />

      {labelTopLeft && (
        <div style={{
          position: "absolute", top: 0, left: 0, zIndex: 5,
          background: "var(--walnut)", color: "var(--maple)",
          padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
          whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
          border: "1px solid rgba(240, 236, 226, 0.25)",
        }}>
          {labelTopLeft}
        </div>
      )}
      {labelBottomRight && (
        <div style={{
          position: "absolute", bottom: 0, right: 0, zIndex: 5,
          background: "var(--maple)", color: "var(--walnut)",
          padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
          whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
          border: "1px solid rgba(23, 20, 15, 0.2)",
        }}>
          {labelBottomRight}
        </div>
      )}

      {/* Buitenste frame — het donkere, walnoot-gekleurde houten randje van
          het fysieke bord, met een eigen houtnerf-textuur. Het speelvlak
          zelf (hieronder) heeft een eigen, lichtere textuur en is dus geen
          geschakeerd dam-patroon meer, maar één massief stuk hout zoals op
          de foto's van het echte bord. */}
      <div
        style={{
          position: "relative",
          width: "min(88vw, 484px)",
          height: "min(88vw, 484px)",
          padding: 10,
          borderRadius: 4,
          backgroundColor: "var(--walnut)",
          backgroundImage: FRAME_WOOD_TEXTURE,
          backgroundSize: "cover",
          boxShadow: "0 0 0 1px rgba(240, 236, 226, 0.18), 0 8px 24px rgba(0,0,0,0.5)",
        }}
      >
        <div
          className="grid"
          style={{
            position: "relative",
            gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${SIZE}, 1fr)`,
            width: "100%",
            height: "100%",
            borderRadius: 2,
            /* Bewust zichtbaar (niet hidden): de stukken hieronder staan
               "rechtop" en steken daardoor iets boven hun eigen vakje uit,
               net als op chess.com — dat mag niet afgesneden worden. */
            overflow: "visible",
            backgroundColor: "var(--board-light)",
            backgroundImage: SURFACE_WOOD_TEXTURE,
            backgroundSize: "cover",
          }}
        >
          {Array.from({ length: SIZE }).map((_, r) =>
            Array.from({ length: SIZE }).map((_, c) => {
              const cell = board[r][c];
              const center = isCenter(r, c);
              const isSel = selected && selected.r === r && selected.c === c;
              const isSlideTarget = slideAnim && slideAnim.to.r === r && slideAnim.to.c === c;
              const isHighlighted = highlight && highlight.r === r && highlight.c === c;
              const isMoveTarget = moveTargets && moveTargets.some((t) => t.r === r && t.c === c);
              const isPendingTool = pendingTool && pendingTool.r === r && pendingTool.c === c;
              const isPlaceAnim = placeAnim && placeAnim.r === r && placeAnim.c === c;
              return (
                <div
                  key={`${r}-${c}`}
                  onClick={() => onCellClick?.(r, c)}
                  style={{
                    position: "relative",
                    background: center ? "rgba(74, 50, 34, 0.14)" : "transparent",
                    borderRight: "1px solid rgba(74, 50, 34, 0.28)",
                    borderBottom: "1px solid rgba(74, 50, 34, 0.28)",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "center",
                    cursor: interactive ? "pointer" : "default",
                  }}
                >
                  {center && (
                    <div style={{
                      position: "absolute", width: "60%", height: "60%",
                      border: "2px solid var(--walnut)", borderRadius: "50%", opacity: 0.55,
                    }} />
                  )}
                  {isHighlighted && (
                    <div className="board-highlight-ring" style={{
                      position: "absolute", inset: "6%", borderRadius: "50%",
                      border: "3px solid var(--accent)",
                    }} />
                  )}
                  {isMoveTarget && (
                    <div style={{
                      position: "absolute", width: "32%", height: "32%", borderRadius: "50%",
                      background: "var(--accent)", opacity: 0.55,
                      boxShadow: "0 0 0 4px rgba(193, 68, 58, 0.18)",
                    }} />
                  )}
                  {isPendingTool && (
                    <div className="pending-tool-pulse" style={{ width: "44%", marginBottom: "3%" }}>
                      <ToolPiece owner={pendingTool.owner} />
                    </div>
                  )}
                  {cell && !isSlideTarget && (
                    <div
                      className={isPlaceAnim ? "tool-place-pop" : undefined}
                      style={{
                        width: cell.type === "pawn" ? "58%" : "44%",
                        marginBottom: "3%",
                        filter: isSel
                          ? "drop-shadow(0 0 2px var(--accent)) drop-shadow(0 0 4px var(--accent))"
                          : undefined,
                      }}
                    >
                      {PieceFor(cell.type, cell.owner)}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {slideAnim && (
            <div
              style={{
                position: "absolute",
                top: `${((slideAnim.animating ? slideAnim.to.r : slideAnim.from.r) / SIZE) * 100}%`,
                left: `${((slideAnim.animating ? slideAnim.to.c : slideAnim.from.c) / SIZE) * 100}%`,
                width: `${100 / SIZE}%`,
                height: `${100 / SIZE}%`,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                transition: "top 240ms ease, left 240ms ease",
                pointerEvents: "none",
              }}
            >
              <div style={{ width: slideAnim.piece.type === "pawn" ? "58%" : "44%", marginBottom: "3%" }}>
                {PieceFor(slideAnim.piece.type, slideAnim.piece.owner)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
