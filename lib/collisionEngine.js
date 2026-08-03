// Collision spel-engine — pure functies, geen DOM.
// Wordt gebruikt door de game-pagina (client) om zetten te berekenen
// en te valideren voordat de nieuwe staat naar Supabase geschreven wordt.

export const SIZE = 11;
export const CENTER = 5;

export const DIRS = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

export function otherPlayer(p) {
  return p === "A" ? "B" : "A";
}

export function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

export function isCenter(r, c) {
  return r === CENTER && c === CENTER;
}

function initialBoard() {
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  board[0][0] = { type: "pawn", owner: "A" };
  board[10][10] = { type: "pawn", owner: "B" };
  return board;
}

export function freshState() {
  return {
    board: initialBoard(),
    pawnPos: { A: [0, 0], B: [10, 10] },
    toolsRemaining: { A: 5, B: 5 },
    turn: "A",
    winner: null,
    // Compacte geschiedenis van zet-deltas (niet volledige bordkopieën) —
    // genoeg om elke eerdere bordstaat puur visueel te reconstrueren voor
    // het terugkijk-systeem, zonder de opslag per zet op te blazen.
    history: [],
    // Gestructureerde log-items (niet kant-en-klare tekst) zodat de client
    // ze met de actuele spelernamen kan tonen i.p.v. vaste "Speler A/B" —
    // zie formatLogEntry() in de spelpagina.
    log: [{ key: "start" }],
  };
}

// Reconstrueert de bordstaat na het toepassen van history[0..uptoIndex].
// uptoIndex < 0 levert de beginstaat op (nog geen zetten toegepast).
export function reconstructBoard(history, uptoIndex) {
  const board = initialBoard();
  const end = Math.min(uptoIndex, history.length - 1);
  for (let i = 0; i <= end; i++) {
    const entry = history[i];
    if (entry.from) board[entry.from[0]][entry.from[1]] = null;
    board[entry.to[0]][entry.to[1]] = { type: entry.type, owner: entry.owner };
  }
  return board;
}

export function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

// Simuleert een stuiterbeweging vanaf pos in richting dir.
export function slide(board, pos, dir, isPawn) {
  const [dr, dc] = DIRS[dir];
  let cur = [pos[0], pos[1]];
  while (true) {
    const nr = cur[0] + dr;
    const nc = cur[1] + dc;
    if (!inBounds(nr, nc)) break;
    if (isCenter(nr, nc)) {
      if (isPawn) cur = [nr, nc]; // pion stopt precies op het centrum
      break; // hulpstuk stuitert ervoor, betreedt centrum nooit
    }
    if (board[nr][nc]) break; // botsing
    cur = [nr, nc];
  }
  if (cur[0] === pos[0] && cur[1] === pos[1]) return null;
  return cur;
}

// Controleert of een pion op pos nog een weg heeft naar het centrum.
export function pawnCanReachCenter(board, pos) {
  const visited = new Set([pos[0] + "," + pos[1]]);
  const queue = [pos];
  while (queue.length) {
    const [r, c] = queue.shift();
    if (isCenter(r, c)) return true;
    for (const [dr, dc] of Object.values(DIRS)) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const key = nr + "," + nc;
      if (visited.has(key)) continue;
      if (board[nr][nc]) continue;
      visited.add(key);
      queue.push([nr, nc]);
    }
  }
  return false;
}

// Geen enkele zet/plaatsing mag een pion (van beide spelers, ook je eigen)
// permanent afsluiten van het centrum — beperkte bewegingsvrijheid mag,
// zolang er een weg naar het centrum open blijft.
export function bothPawnsCanReachCenter(board, pawnPos) {
  return pawnCanReachCenter(board, pawnPos.A) && pawnCanReachCenter(board, pawnPos.B);
}

export function anyDirectionAvailable(board, pos, isPawn) {
  return Object.keys(DIRS).some((dir) => slide(board, pos, dir, isPawn) !== null);
}

// Probeert een hulpstuk te plaatsen. Retourneert { ok, state, error }.
export function applyPlaceTool(state, player, r, c) {
  if (state.winner) return { ok: false, error: "Spel is al afgelopen." };
  if (state.turn !== player) return { ok: false, error: "Niet jouw beurt." };
  if (state.toolsRemaining[player] <= 0) return { ok: false, error: "Geen hulpstukken meer over." };
  if (isCenter(r, c)) return { ok: false, error: "Een hulpstuk mag niet op het centrum." };
  if (state.board[r][c]) return { ok: false, error: "Vakje is al bezet." };

  const trial = cloneBoard(state.board);
  trial[r][c] = { type: "tool", owner: player };
  if (!bothPawnsCanReachCenter(trial, state.pawnPos)) {
    return { ok: false, error: "Dit zou een pion volledig insluiten." };
  }

  const opp = otherPlayer(player);
  const next = {
    ...state,
    board: trial,
    toolsRemaining: { ...state.toolsRemaining, [player]: state.toolsRemaining[player] - 1 },
    turn: opp,
    history: [...(state.history || []), { from: null, to: [r, c], type: "tool", owner: player }],
    log: [{ key: "place", role: player, r, c }, ...state.log].slice(0, 40),
  };
  return { ok: true, state: next };
}

// Eén stuiter-segment van een zet. endTurn geeft aan of de beurt na deze
// zet stopt (speler koos ervoor te stoppen, of er is geen vervolg mogelijk).
export function applyMove(state, player, from, dir, endTurn) {
  if (state.winner) return { ok: false, error: "Spel is al afgelopen." };
  if (state.turn !== player) return { ok: false, error: "Niet jouw beurt." };

  const cell = state.board[from[0]][from[1]];
  if (!cell || cell.owner !== player) return { ok: false, error: "Dat is niet jouw stuk." };

  const isPawn = cell.type === "pawn";
  const dest = slide(state.board, from, dir, isPawn);
  if (!dest) return { ok: false, error: "Geen beweging mogelijk in die richting." };

  const winningMove = isPawn && isCenter(dest[0], dest[1]);

  const trial = cloneBoard(state.board);
  trial[from[0]][from[1]] = null;
  trial[dest[0]][dest[1]] = { type: cell.type, owner: player };

  const nextPawnPos = isPawn ? { ...state.pawnPos, [player]: dest } : state.pawnPos;

  if (!winningMove && !bothPawnsCanReachCenter(trial, nextPawnPos)) {
    return { ok: false, error: "Deze zet zou een pion volledig insluiten." };
  }

  const opp = otherPlayer(player);

  let next = {
    ...state,
    board: trial,
    pawnPos: nextPawnPos,
    history: [...(state.history || []), { from, to: dest, type: cell.type, owner: player }],
    log: [{ key: "move", role: player, isPawn, r: dest[0], c: dest[1] }, ...state.log].slice(0, 40),
  };

  if (winningMove) {
    next.winner = player;
    return { ok: true, state: next, dest, winningMove: true };
  }

  const mustEndTurn = endTurn || !anyDirectionAvailable(trial, dest, isPawn);
  next.turn = mustEndTurn ? opp : player;

  return { ok: true, state: next, dest, winningMove: false, turnEnded: mustEndTurn };
}
