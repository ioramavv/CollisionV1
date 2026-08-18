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
      </defs>
    </svg>
  );
}

// Pion — getoond vanaf de zijkant (zoals op chess.com) i.p.v. recht van
// boven: een plat afgekante kop, een korte hals en een slanke buik die naar
// een afgeronde voet toeloopt, met een verticaal groefje in de buik — de
// exacte vorm is overgenomen via pixelmetingen op de aangeleverde
// maatvoeringsfoto's (kop Ø12mm vlak boven een scherpe stap naar de hals,
// buik die vloeiend verbreedt tot vlak boven de voet, 1,5mm uitstek).
function Pawn({ owner }) {
  const body = owner === "A" ? "collision-piece-maple-body" : "collision-piece-walnut-body";
  return (
    <svg viewBox="0 0 100 145" style={{ width: "100%", height: "auto", display: "block" }} aria-hidden="true">
      <ellipse cx="50" cy="138" rx="27" ry="6" fill="rgba(0,0,0,0.32)" />
      {/* buik — verbreedt vloeiend van de hals tot vlak boven de voet */}
      <path
        d="M26,39
           C18,60 13,85 13,105
           C13,120 15,127 20,130
           Q50,138 80,130
           C85,127 87,120 87,105
           C87,85 82,60 74,39
           Z"
        fill={`url(#${body})`}
        stroke="rgba(0,0,0,0.26)"
        strokeWidth="1"
      />
      {/* verticaal groefje in de buik */}
      <rect x="46" y="66" width="8" height="26" rx="4" fill="rgba(0,0,0,0.22)" />
      {/* kop — korte, platgetopte cilinder, met een scherpe stap naar de hals */}
      <path
        d="M21,37 L21,14 Q21,6 29,6 L71,6 Q79,6 79,14 L79,37 Z"
        fill={`url(#${body})`}
        stroke="rgba(0,0,0,0.24)"
        strokeWidth="0.9"
      />
      <ellipse cx="50" cy="8" rx="13" ry="4" fill="rgba(255,255,255,0.18)" />
    </svg>
  );
}

// Hulpstuk — een kort, breed kegeltje met rechte zijden en een scherpe
// driehoekige punt (geen bolle top), net als de maatvoeringstekening
// (h≈17mm, voet Ø≈23mm, punt 3mm) — vorm ook hier overgenomen via
// pixelmetingen op de aangeleverde foto's.
function ToolPiece({ owner }) {
  const body = owner === "A" ? "collision-piece-maple-body" : "collision-piece-walnut-body";
  return (
    <svg viewBox="0 0 100 74" style={{ width: "100%", height: "auto", display: "block" }} aria-hidden="true">
      <ellipse cx="50" cy="70" rx="35" ry="6" fill="rgba(0,0,0,0.3)" />
      <path
        d="M5,68 L17.5,18 L50,6 L82.5,18 L95,68 Z"
        fill={`url(#${body})`}
        stroke="rgba(0,0,0,0.28)"
        strokeWidth="1"
      />
      <path d="M17.5,18 Q50,23 82.5,18" fill="none" stroke="rgba(0,0,0,0.16)" strokeWidth="1" />
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
                    background: center ? "var(--walnut)" : "transparent",
                    borderRight: "1px solid rgba(74, 50, 34, 0.28)",
                    borderBottom: "1px solid rgba(74, 50, 34, 0.28)",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "center",
                    cursor: interactive ? "pointer" : "default",
                  }}
                >
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
