// Computerspeler voor Collision, met 4 moeilijkheidsgraden.
//
// Hergebruikt de bestaande spel-engine (applyMove/applyPlaceTool) voor alle
// validatie van kandidaat-zetten, zodat de AI nooit een zet kan kiezen die
// het echte spel zou afwijzen (o.a. de insluitregel). De AI zelf genereert
// kandidaten, scoort ze heuristisch, en kijkt voor de hogere moeilijk-
// heidsgraden een aantal beurten vooruit via minimax met alfa-bèta-
// afkapping — met een beperkte breedte per niveau (topK) zodat het diepere
// zoeken snel genoeg blijft om synchroon in de browser te draaien.

import {
  SIZE, CENTER, DIRS, otherPlayer, isCenter, cloneBoard, slide,
  applyMove, applyPlaceTool,
} from "./collisionEngine";

const MAX_BOUNCE_DEPTH = 6; // max. stuiter-segmenten die vooruit verkend worden per stuk
const JITTER = 1.4; // kleine willekeur, zodat lagere niveaus niet volledig voorspelbaar spelen

export const DIFFICULTIES = ["easy", "medium", "hard", "expert"];
export const DIFFICULTY_LABELS = {
  easy: "Makkelijk",
  medium: "Gemiddeld",
  hard: "Moeilijk",
  expert: "Expert",
};

// depth = aantal halve beurten (plies) vooruit, inclusief de eigen zet zelf.
// rootK/deepK = breedte-afkapping (hoeveel van de beste kandidaten worden
// meegenomen): rootK voor de eigen, daadwerkelijke zetkeuze, deepK voor het
// verder vooruitkijken daaronder. Het plaatsen van een hulpstuk kan vroeg in
// het spel op ruim 100 verschillende vakjes — zonder afkapping wordt
// vooruitkijken exponentieel duur, dus elk niveau hierboven "gemiddeld"
// beperkt de breedte om binnen een fractie van een seconde te blijven.
const DIFFICULTY_CONFIG = {
  easy: { random: true },
  medium: { depth: 1, rootK: Infinity, deepK: Infinity, jitter: true },
  hard: { depth: 2, rootK: 20, deepK: 20, jitter: false },
  expert: { depth: 3, rootK: 8, deepK: 6, jitter: false },
};

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

// Zuivere, deterministische score van een boardstate vanuit het perspectief
// van `perspective` — hoger is beter voor die speler. Geen willekeur hier:
// die wordt apart toegevoegd waar nodig, anders zou minimax inconsistente
// waarden voor dezelfde state kunnen teruggeven.
function evaluate(state, perspective) {
  if (state.winner === perspective) return Infinity;
  if (state.winner && state.winner !== perspective) return -Infinity;
  const opp = otherPlayer(perspective);
  const ownDist = centerDist(state.pawnPos[perspective]);
  const oppDist = centerDist(state.pawnPos[opp]);
  const ownFreedom = freedom(state.board, state.pawnPos[perspective]);
  const oppFreedom = freedom(state.board, state.pawnPos[opp]);
  return (oppDist - ownDist) * 3 + (ownFreedom - oppFreedom) * 0.1;
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
    if (path.length >= MAX_BOUNCE_DEPTH) return;
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

// Genereert alle legale volledige beurten voor `player` vanuit `state`:
// de eigen pion verplaatsen, een eigen al geplaatst hulpstuk verplaatsen, of
// een nieuw hulpstuk plaatsen. Geeft voor elke optie zowel de actie
// (bruikbaar om 'm echt uit te voeren) als de resulterende state terug.
function generateCandidates(state, player) {
  const candidates = [];

  for (const { path } of reachablePaths(state.board, state.pawnPos[player], true)) {
    const result = simulatePath(state, player, state.pawnPos[player], path);
    if (result) candidates.push({ action: { type: "move", from: state.pawnPos[player], dirs: path }, resultState: result });
  }

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = state.board[r][c];
      if (!cell || cell.type !== "tool" || cell.owner !== player) continue;
      for (const { path } of reachablePaths(state.board, [r, c], false)) {
        const result = simulatePath(state, player, [r, c], path);
        if (result) candidates.push({ action: { type: "move", from: [r, c], dirs: path }, resultState: result });
      }
    }
  }

  if (state.toolsRemaining[player] > 0) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (isCenter(r, c) || state.board[r][c]) continue;
        const result = applyPlaceTool(state, player, r, c);
        if (result.ok) candidates.push({ action: { type: "place", r, c }, resultState: result.state });
      }
    }
  }

  return candidates;
}

// Minimax met alfa-bèta-afkapping en een breedte-limiet (topK) per niveau,
// zodat dieper vooruitkijken haalbaar blijft. Kandidaten worden eerst
// gesorteerd op hun eigen, directe heuristiek — dat is zowel een redelijke
// aanname voor hoe de zet-nde speler zelf zou kiezen, als goede move-
// ordering voor de alfa-bèta-afkapping.
function search(state, mover, botPerspective, depth, topK, alpha, beta) {
  if (state.winner || depth === 0) return evaluate(state, botPerspective);

  const candidates = generateCandidates(state, mover);
  if (candidates.length === 0) return evaluate(state, botPerspective);

  candidates.sort((a, b) => evaluate(b.resultState, mover) - evaluate(a.resultState, mover));
  const top = candidates.slice(0, topK);
  const maximizing = mover === botPerspective;
  let best = maximizing ? -Infinity : Infinity;

  for (const { resultState } of top) {
    const score = search(resultState, otherPlayer(mover), botPerspective, depth - 1, topK, alpha, beta);
    if (maximizing) {
      if (score > best) best = score;
      if (best > alpha) alpha = best;
    } else {
      if (score < best) best = score;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

// Bepaalt de volledige beurt van de computerspeler: welk stuk (of nieuw
// hulpstuk) waarheen. `difficulty` is een van DIFFICULTIES (standaard
// "medium"). Geeft null terug als er werkelijk geen enkele geldige actie
// bestaat (zou in de praktijk niet moeten voorkomen).
export function chooseComputerTurn(state, bot, difficulty = "medium") {
  const candidates = generateCandidates(state, bot);
  if (candidates.length === 0) return null;

  const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;

  if (config.random) {
    return candidates[Math.floor(Math.random() * candidates.length)].action;
  }

  candidates.sort((a, b) => evaluate(b.resultState, bot) - evaluate(a.resultState, bot));
  const rootCandidates = candidates.slice(0, config.rootK);

  let best = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;
  for (const { action, resultState } of rootCandidates) {
    let score = search(resultState, otherPlayer(bot), bot, config.depth - 1, config.deepK, alpha, beta);
    if (config.jitter) score += (Math.random() - 0.5) * JITTER;
    if (score > bestScore) { bestScore = score; best = action; }
    if (score > alpha) alpha = score;
  }
  return best;
}
