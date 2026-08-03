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

export default function Board({ board, selected, slideAnim, interactive, onCellClick, highlight }) {
  return (
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
                  border: "2px solid var(--accent)", borderRadius: "50%", opacity: 0.55,
                }} />
              )}
              {isHighlighted && (
                <div className="board-highlight-ring" style={{
                  position: "absolute", inset: "6%", borderRadius: "50%",
                  border: "3px solid var(--accent)",
                }} />
              )}
              {cell && !isSlideTarget && (
                <div style={{
                  width: cell.type === "pawn" ? "62%" : "38%",
                  height: cell.type === "pawn" ? "62%" : "38%",
                  borderRadius: cell.type === "pawn" ? "50%" : "3px",
                  transform: cell.type === "tool" ? "rotate(45deg)" : "none",
                  background: cell.owner === "A" ? "var(--walnut)" : "var(--maple)",
                  boxShadow: isSel
                    ? "0 0 0 2px var(--accent)"
                    : "0 0 0 1.5px rgba(23, 20, 15, 0.55), 0 1px 3px rgba(0,0,0,0.4)",
                }} />
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
            background: slideAnim.piece.owner === "A" ? "var(--walnut)" : "var(--maple)",
            boxShadow: "0 0 0 1.5px rgba(23, 20, 15, 0.55), 0 1px 3px rgba(0,0,0,0.4)",
          }} />
        </div>
      )}
    </div>
  );
}
