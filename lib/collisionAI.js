// Heuristische computerspeler voor Collision.
//
// Hergebruikt de bestaande spel-engine (applyMove/applyPlaceTool) voor alle
// validatie van kandidaat-zetten, zodat de AI nooit een zet kan kiezen die
// het echte spel zou afwijzen (o.a. de insluitregel). De AI zelf doet enkel
// het genereren van kandidaten en het scoren ervan.

import {
  SIZE, CENTER, DIRS, otherPlayer, isCenter, cloneBoard, slide,
  applyMove, applyPlaceTool,
} from "./collisionEngine";

const MAX_DEPTH = 6; // max. stuiter-segmenten die vooruit verkend worden per stuk
const JITTER = 1.4; // kleine willekeur, zodat de computer niet volledig voorspelbaar speelt

function centerDist(pos) {
  return Math.max(Math.abs(pos[0] - CENTER), Math.abs(pos[1] - CENTER));
}

// Ruwe maat voor bewegingsvrijheid: hoeveel lege vakjes een pion via vrije
// stappen kan bereiken. Gebruikt om de tegenstander te mogen beperken
// zonder te moeten weten of dat een volledige insluiting is (die regel
// wordt al apart afgedwongen door de engine zelf).
function freedom(board, pos) {
  const visited = new Set([pos.join(",")]);
  const queue = [pos];
  let count = 0;
  while (queue.length && count < 60) {
    const [r, c] = queue.shift();
    count++;
    for (const [dr, dc] of Object.values(DIRS)) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      const key = nr + "," + nc;
      if (visited.has(key)) continue;
      if (board[nr][nc]) continue;
      visited.add(key);
      queue.push([nr, nc]);
    }
  }
  return count;
}

function evaluate(state, bot) {
  if (state.winner === bot) return Infinity;
  if (state.winner && state.winner !== bot) return -Infinity;
  const opp = otherPlayer(bot);
  const ownDist = centerDist(state.pawnPos[bot]);
  const oppDist = centerDist(state.pawnPos[opp]);
  const ownFreedom = freedom(state.board, state.pawnPos[bot]);
  const oppFreedom = freedom(state.board, state.pawnPos[opp]);
  let score = (oppDist - ownDist) * 3 + (ownFreedom - oppFreedom) * 0.1;
  score += (Math.random() - 0.5) * JITTER;
  return score;
}

// Verkent alle bereikbare eindposities van één stuk via stuiterketens
// (de richting mag elke stap wisselen), tot een beperkte diepte. Geeft per
// bereikbare positie de richtingenreeks terug die ernaartoe leidt.
function reachablePaths(board, start, isPawn) {
  const working = cloneBoard(board);
  working[start[0]][start[1]] = null;
  const results = [];
  const visited = new Set([start.join(",")]);

  function dfs(pos, path) {
    if (path.length > 0) results.push({ path });
    if (path.length >= MAX_DEPTH) return;
    for (const dir of Object.keys(DIRS)) {
      const dest = slide(working, pos, dir, isPawn);
      if (!dest) continue;
      const key = dest.join(",");
      if (visited.has(key)) continue;
      visited.add(key);
      dfs(dest, [...path, dir]);
    }
  }
  dfs(start, []);
  return results;
}

// Speelt een reeks richtingen door tegen de echte engine, zodat een
// kandidaat-zet exact dezelfde validatie doorloopt als een menselijke zet.
// Geeft null terug zodra de reeks ergens ongeldig blijkt.
function simulatePath(state, player, from, dirs) {
  let cur = state;
  let pos = from;
  for (let i = 0; i < dirs.length; i++) {
    const isLast = i === dirs.length - 1;
    const result = applyMove(cur, player, pos, dirs[i], isLast);
    if (!result.ok) return null;
    cur = result.state;
    pos = result.dest;
    if (result.winningMove) break;
  }
  return cur;
}

// Bepaalt de volledige beurt van de computerspeler: welk stuk (of nieuw
// hulpstuk) waarheen. Geeft null terug als er werkelijk geen enkele
// geldige actie bestaat (zou in de praktijk niet moeten voorkomen).
export function chooseComputerTurn(state, bot) {
  let best = null;
  let bestScore = -Infinity;

  function consider(candidate, resultState) {
    const score = evaluate(resultState, bot);
    if (score > bestScore) { bestScore = score; best = candidate; }
  }

  // 1) Eigen pion verplaatsen.
  for (const { path } of reachablePaths(state.board, state.pawnPos[bot], true)) {
    const result = simulatePath(state, bot, state.pawnPos[bot], path);
    if (result) consider({ type: "move", from: state.pawnPos[bot], dirs: path }, result);
  }

  // 2) Eigen, al geplaatste hulpstukken verplaatsen.
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = state.board[r][c];
      if (!cell || cell.type !== "tool" || cell.owner !== bot) continue;
      for (const { path } of reachablePaths(state.board, [r, c], false)) {
        const result = simulatePath(state, bot, [r, c], path);
        if (result) consider({ type: "move", from: [r, c], dirs: path }, result);
      }
    }
  }

  // 3) Nieuw hulpstuk plaatsen.
  if (state.toolsRemaining[bot] > 0) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (isCenter(r, c) || state.board[r][c]) continue;
        const result = applyPlaceTool(state, bot, r, c);
        if (result.ok) consider({ type: "place", r, c }, result.state);
      }
    }
  }

  return best;
}
