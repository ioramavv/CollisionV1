"use client";
// Herbruikbaar spelbord — gebruikt door zowel de echte spelpagina als de
// uitlegpagina (tutorial), zodat een voorbeeld/oefenpartij er pixel-voor-
// pixel hetzelfde uitziet als een echte partij.

import { SIZE, isCenter } from "./collisionEngine";

export default function Board({ board, selected, slideAnim, interactive, onCellClick }) {
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
