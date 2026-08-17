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
          boxShadow: "0 0 0 1px rgba(240, 236, 226, 0.18), 0 8px 24px rgba(0,0,0,0.5)",
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
                  background: center
                    ? "var(--board-dark)"
                    : (r + c) % 2 === 0 ? "var(--board-dark)" : "var(--board-light)",
                  display: "flex",
                  alignItems: "center",
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
                  <div className="pending-tool-pulse" style={{
                    position: "absolute", width: "38%", height: "38%", borderRadius: "3px",
                    transform: "rotate(45deg)",
                    background: pendingTool.owner === "A" ? "var(--maple)" : "var(--walnut)",
                    border: "2px dashed var(--accent)",
                  }} />
                )}
                {cell && !isSlideTarget && (
                  <div
                    className={isPlaceAnim ? "tool-place-pop" : undefined}
                    style={{
                      width: cell.type === "pawn" ? "62%" : "38%",
                      height: cell.type === "pawn" ? "62%" : "38%",
                      borderRadius: cell.type === "pawn" ? "50%" : "3px",
                      transform: cell.type === "tool" ? "rotate(45deg)" : "none",
                      background: cell.owner === "A" ? "var(--maple)" : "var(--walnut)",
                      boxShadow: isSel
                        ? "0 0 0 2px var(--accent)"
                        : "0 0 0 1.5px rgba(23, 20, 15, 0.55), 0 1px 3px rgba(0,0,0,0.4)",
                    }}
                  />
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
              background: slideAnim.piece.owner === "A" ? "var(--maple)" : "var(--walnut)",
              boxShadow: "0 0 0 1.5px rgba(23, 20, 15, 0.55), 0 1px 3px rgba(0,0,0,0.4)",
            }} />
          </div>
        )}
      </div>
    </div>
  );
}
