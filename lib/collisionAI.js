// Computerspeler voor Collision, met 4 moeilijkheidsgraden.
//
// Hergebruikt de bestaande spel-engine (applyMove/applyPlaceTool) voor alle
// validatie van kandidaat-zetten, zodat de AI nooit een zet kan kiezen die
// het echte spel zou afwijzen (o.a. de insluitregel). De AI zelf genereert
// kandidaten, scoort ze heuristisch, en kijkt via minimax met alfa-bèta-
// afkapping vooruit — met een oplopende zoekdiepte (iterative deepening)
// binnen een tijdsbudget per moeilijkheidsgraad, zodat elk niveau de
// beschikbare rekentijd optimaal benut zonder de browser merkbaar te laten
// hangen (chooseComputerTurn draait synchroon op de hoofdthread, zie
// app/(app)/game/[id]/page.js en app/(app)/tutorial/page.js).
//
// Twee gedragsregels gelden voor alle niveaus, ook Makkelijk:
// - de bot zet zijn eigen pion nooit zomaar terug naar een van de laatste
//   paar vakjes waar hij vandaan kwam (dus ook geen kort heen-en-weer-lusje
//   van een paar vakjes), tenzij dat écht de enige geldige actie is;
// - een hulpstuk wordt alleen geplaatst als dat aantoonbaar het pad van de
//   tegenstander verlengt, of het eigen pad naar het centrum verkort/
//   beschermt — nooit "omdat het toevallig een fractie beter scoort" zonder
//   duidelijk effect.

import {
  SIZE, CENTER, DIRS, otherPlayer, isCenter, cloneBoard, slide, slidePath,
  applyMove, applyPlaceTool,
} from "./collisionEngine";

const MAX_BOUNCE_DEPTH = 10; // max. stuiter-segmenten die vooruit verkend worden per stuk
const JITTER = 1.4; // kleine willekeur, zodat Gemiddeld niet volledig voorspelbaar speelt
const PATH_WEIGHT = 10; // weegfactor voor het padlengte-verschil (stuiters tot centrum)
const FREEDOM_WEIGHT = 0.1; // kleine tie-breaker voor algemene bewegingsvrijheid
const IMMINENT_WIN_BONUS = 60; // extra gewicht als iemand nog maar 1 stuiter van winst is
const UNREACHABLE_PENALTY = MAX_BOUNCE_DEPTH + 2; // vaste "slechte" waarde i.p.v. Infinity

// Sentinel-waarde waarmee search() aangeeft dat het tijdsbudget verstreek
// halverwege een zoekactie — die uitkomst wordt weggegooid (niet als score
// gebruikt), zie chooseComputerTurn hieronder.
const TIMEOUT = Symbol("timeout");

export const DIFFICULTIES = ["easy", "medium", "hard", "expert"];
export const DIFFICULTY_LABELS = {
  easy: "Makkelijk",
  medium: "Gemiddeld",
  hard: "Moeilijk",
  expert: "Expert",
};

// timeBudgetMs = hoeveel rekentijd een niveau maximaal krijgt (iterative
// deepening stopt zodra dit verstrijkt en gebruikt de laatst volledig
// afgeronde diepte). maxDepth is een vangnet zodat diepte niet ongelimiteerd
// doorgroeit als een stelling toevallig heel snel te doorzoeken is. topK
// beperkt de breedte in de recursieve zoeklagen (niet bij de wortel zelf —
// daar worden alle kandidaten serieus overwogen), zodat dieper zoeken
// haalbaar blijft. Makkelijk zoekt niet vooruit: kiest willekeurig uit de al
// opgeschoonde kandidatenlijst (dus nooit een zinloze terugzet of hulpstuk).
const DIFFICULTY_CONFIG = {
  easy: { randomFromCandidates: true },
  medium: { timeBudgetMs: 200, maxDepth: 3, topK: 10, jitter: true },
  hard: { timeBudgetMs: 500, maxDepth: 5, topK: 8, jitter: false },
  expert: { timeBudgetMs: 1000, maxDepth: 7, topK: 6, jitter: false },
};

// Ruwe maat voor bewegingsvrijheid: hoeveel lege vakjes een pion via vrije
// stappen kan bereiken. Zuiver een secundaire tie-breaker naast de
// padlengte-naar-centrum hieronder, die de eigenlijke winvoorwaarde meet.
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

// BFS in lagen van "aantal stuiters" vanaf pos (dezelfde stuiterlogica als
// slide() in de engine, niet hemelsbrede afstand). Geeft de kortste
// padlengte naar het centrum terug (Infinity als dat niet binnen
// MAX_BOUNCE_DEPTH stuiters lukt), de set bereikte landingsvakjes (waar een
// stuiter daadwerkelijk eindigt), én de set doorkruíste vakjes (elk vakje
// dat een stuiter onderweg passeert, dus ook vóór de landing). Dat laatste
// is essentieel voor toolPlacementCandidates hieronder: als een pion een
// volledig vrije, ongehinderde weg naar het centrum heeft, is de énige
// "landing" van die stuiter het centrum zelf (waar je nooit een hulpstuk op
// mag zetten) — zonder de doorkruiste tussenvakjes zou de bot dan he-le-maal
// geen kandidaat-vakje meer overhouden om die aanstormende pion mee te
// blokkeren, wat een concreet waargenomen "de bot laat de tegenstander
// winnen i.p.v. te blokkeren"-bug gaf.
function exploreBounces(board, pos, isPawn) {
  const working = cloneBoard(board);
  working[pos[0]][pos[1]] = null;
  const visited = new Set([pos.join(",")]);
  const swept = new Set();
  let frontier = [pos];
  let pathLength = isCenter(pos[0], pos[1]) ? 0 : Infinity;
  let depth = 0;
  while (frontier.length && depth < MAX_BOUNCE_DEPTH && pathLength === Infinity) {
    depth++;
    const next = [];
    for (const p of frontier) {
      for (const dir of Object.keys(DIRS)) {
        const { dest, cells } = slidePath(working, p, dir, isPawn);
        if (!dest) continue;
        for (const cell of cells) swept.add(cell.join(","));
        if (isCenter(dest[0], dest[1]) && pathLength === Infinity) pathLength = depth;
        const key = dest.join(",");
        if (visited.has(key)) continue;
        visited.add(key);
        next.push(dest);
      }
    }
    frontier = next;
  }
  return { pathLength, visited, swept };
}

function pathLengthToCenter(board, pos) {
  return exploreBounces(board, pos, true).pathLength;
}

// Zuivere, deterministische score van een boardstate vanuit het perspectief
// van `perspective` — hoger is beter voor die speler. Geen willekeur hier:
// die wordt apart toegevoegd waar nodig, anders zou minimax inconsistente
// waarden voor dezelfde state kunnen teruggeven.
//
// Gebruikt de echte padlengte-in-stuiters i.p.v. hemelsbrede afstand: een
// pion die dicht bij het centrum staat maar door hulpstukken is ingesloten
// is feitelijk ver van winst, en dat moet de heuristiek ook zo zien. Een
// dreigende winst binnen 1 stuiter krijgt daarbovenop een flinke extra
// bonus/straf, want dat is vrijwel een gedwongen zet voor wie er als eerste
// bij mag.
function evaluate(state, perspective) {
  if (state.winner === perspective) return Infinity;
  if (state.winner && state.winner !== perspective) return -Infinity;
  const opp = otherPlayer(perspective);
  const ownPos = state.pawnPos[perspective];
  const oppPos = state.pawnPos[opp];

  const ownPathRaw = pathLengthToCenter(state.board, ownPos);
  const oppPathRaw = pathLengthToCenter(state.board, oppPos);
  const ownPath = Number.isFinite(ownPathRaw) ? ownPathRaw : UNREACHABLE_PENALTY;
  const oppPath = Number.isFinite(oppPathRaw) ? oppPathRaw : UNREACHABLE_PENALTY;
  const ownFreedom = freedom(state.board, ownPos);
  const oppFreedom = freedom(state.board, oppPos);

  let score = (oppPath - ownPath) * PATH_WEIGHT + (ownFreedom - oppFreedom) * FREEDOM_WEIGHT;
  if (ownPath <= 1) score += IMMINENT_WIN_BONUS;
  if (oppPath <= 1) score -= IMMINENT_WIN_BONUS;
  return score;
}

// Verkent alle bereikbare eindposities van één stuk via stuiterketens
// (de richting mag elke stap wisselen), tot een beperkte diepte. Geeft per
// bereikbare positie de kortste richtingenreeks terug die ernaartoe leidt.
//
// Breedte-eerst (niet diepte-eerst): een positie wordt zo altijd via zijn
// kórtste pad ontdekt. Bij een diepte-eerste verkenning kon een vakje
// toevallig eerst via een onnodig lange, kronkelige route gevonden worden,
// wat budget uit MAX_BOUNCE_DEPTH opsoupeerde en verder zoeken vándaar
// blokkeerde — met als concreet, waargenomen gevolg dat de bot een winnende
// stuiter net niet zag omdat de kortste weg ernaartoe (met nog ruimte over
// voor die laatste stuiter) genegeerd werd ten faveure van een langere,
// eerder-gevonden omweg naar hetzelfde tussenvakje.
function reachablePaths(board, start, isPawn) {
  const working = cloneBoard(board);
  working[start[0]][start[1]] = null;
  const results = [];
  const visited = new Set([start.join(",")]);
  let frontier = [{ pos: start, path: [] }];
  let depth = 0;

  while (frontier.length && depth < MAX_BOUNCE_DEPTH) {
    depth++;
    const next = [];
    for (const { pos, path } of frontier) {
      for (const dir of Object.keys(DIRS)) {
        const dest = slide(working, pos, dir, isPawn);
        if (!dest) continue;
        const key = dest.join(",");
        if (visited.has(key)) continue;
        visited.add(key);
        const destPath = [...path, dir];
        results.push({ pos: dest, path: destPath });
        next.push({ pos: dest, path: destPath });
      }
    }
    frontier = next;
  }
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

const RECENT_OWN_POSITIONS_WINDOW = 6; // aantal eigen eerdere pion-vakjes dat "vers" genoeg is om te vermijden

// Zoekt de laatste RECENT_OWN_POSITIONS_WINDOW pion-BEURTEN (niet losse
// stuiter-segmenten!) van `player` op en geeft per beurt het vakje terug
// waar die beurt begon. Eén beurt kan uit meerdere stuiter-segmenten bestaan
// (elk segment is een eigen history-entry, zie applyMove in
// collisionEngine.js) — opeenvolgende pion-entries van dezelfde speler horen
// altijd bij dezelfde beurt, want de beurt wisselt pas zodra die speler
// stopt. Zonder deze groepering zou één lange stuiterbeurt het hele venster
// al vullen met tussenliggende stuiter-vakjes, wat op een leeg bord (waar
// toch al maar weinig vakjes bereikbaar zijn) al snel élke beschikbare
// pion-zet zou blokkeren — dat gaf een echte "geen enkele zet mogelijk"-bug
// bij het testen.
function recentOwnPawnPositions(state, player) {
  const history = state.history || [];
  const squares = [];
  let i = history.length - 1;
  while (i >= 0 && squares.length < RECENT_OWN_POSITIONS_WINDOW) {
    const entry = history[i];
    if (entry.type !== "pawn" || entry.owner !== player) { i--; continue; }
    let turnStart = entry.from;
    let j = i - 1;
    while (j >= 0 && history[j].type === "pawn" && history[j].owner === player) {
      turnStart = history[j].from;
      j--;
    }
    squares.push(turnStart);
    i = j;
  }
  return squares;
}

// Beperkt kandidaat-hulpstukplaatsingen tot vakjes die daadwerkelijk op een
// bereikbaar stuiterpad van één van beide pionnen liggen (een vakje
// daarbuiten kan sowieso nooit iets blokkeren, dus is nooit de moeite van
// het simuleren waard) en houdt vervolgens alleen plaatsingen over die
// aantoonbaar het pad van de tegenstander verlengen ("dwarszitten") of het
// eigen pad verkorten/beschermen ("helpt met winnen") — geen meetbaar effect
// betekent geen kandidaat, i.p.v. elke plaatsing met dezelfde algemene
// heuristiek te scoren.
//
// Gebruikt bewust de doorkruíste vakjes (swept), niet alleen de
// landingsvakjes: een pion met een volledig vrije weg naar het centrum
// "landt" pas op het centrum zelf, waar nooit een hulpstuk op mag — zonder
// de tussenliggende vakjes zou er dan geen enkel blokkerend kandidaat-vakje
// overblijven, en zou de bot een tegenstander die op winnen staat gewoon
// laten begaan i.p.v. die weg af te snijden.
function toolPlacementCandidates(state, player) {
  const opp = otherPlayer(player);
  const oppPos = state.pawnPos[opp];
  const ownPos = state.pawnPos[player];

  const oppExplore = exploreBounces(state.board, oppPos, true);
  const ownExplore = exploreBounces(state.board, ownPos, true);
  const oppPathBefore = oppExplore.pathLength;
  const ownPathBefore = ownExplore.pathLength;

  const relevant = new Set([...oppExplore.swept, ...ownExplore.swept]);
  const results = [];

  for (const key of relevant) {
    const [r, c] = key.split(",").map(Number);
    if (isCenter(r, c) || state.board[r][c]) continue;
    const placed = applyPlaceTool(state, player, r, c);
    if (!placed.ok) continue;

    const oppAfter = pathLengthToCenter(placed.state.board, oppPos);
    const ownAfter = pathLengthToCenter(placed.state.board, ownPos);
    const hindersOpp = oppAfter > oppPathBefore || (oppAfter === Infinity && Number.isFinite(oppPathBefore));
    const helpsOwn = ownAfter < ownPathBefore;

    if (hindersOpp || helpsOwn) {
      results.push({ action: { type: "place", r, c }, resultState: placed.state, isPawnMove: false });
    }
  }
  return results;
}

// Noodgreep: alle legale plaatsingen, ongeacht meetbaar effect. Alleen
// gebruikt als er letterlijk geen andere actie mogelijk is (zie
// generateCandidates) — de bot mag nooit zijn beurt hoeven overslaan terwijl
// er wél een legale zet bestaat, ook al heeft die geen aantoonbaar effect.
function allToolPlacementCandidates(state, player) {
  const results = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (isCenter(r, c) || state.board[r][c]) continue;
      const placed = applyPlaceTool(state, player, r, c);
      if (placed.ok) results.push({ action: { type: "place", r, c }, resultState: placed.state, isPawnMove: false });
    }
  }
  return results;
}

// Genereert alle legale volledige beurten voor `mover` vanuit `state`: de
// eigen pion verplaatsen, een eigen al geplaatst hulpstuk verplaatsen, of
// een nieuw hulpstuk plaatsen (beperkt tot zinvolle plekken, zie
// toolPlacementCandidates). Wanneer `mover` de bot zelf is (mover ===
// botIdentity — tijdens het vooruitkijken modelleert deze functie ook de
// tegenstander, en die regel geldt alleen voor de bot zelf) worden
// pion-zetten die zonder noodzaak teruggaan naar een van de laatste eigen
// vakjes verwijderd, tenzij dat de enige optie zou zijn — niet alleen het
// állerlaatste vakje, anders zou een iets langere lus (bv. heen-en-weer
// tussen 3-4 vakjes) nog steeds mogelijk zijn.
function generateCandidates(state, mover, botIdentity) {
  const candidates = [];
  const ownPawnPos = state.pawnPos[mover];

  for (const { path } of reachablePaths(state.board, ownPawnPos, true)) {
    const result = simulatePath(state, mover, ownPawnPos, path);
    if (result) candidates.push({ action: { type: "move", from: ownPawnPos, dirs: path }, resultState: result, isPawnMove: true });
  }

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = state.board[r][c];
      if (!cell || cell.type !== "tool" || cell.owner !== mover) continue;
      for (const { path } of reachablePaths(state.board, [r, c], false)) {
        const result = simulatePath(state, mover, [r, c], path);
        if (result) candidates.push({ action: { type: "move", from: [r, c], dirs: path }, resultState: result, isPawnMove: false });
      }
    }
  }

  if (state.toolsRemaining[mover] > 0) {
    const purposeful = toolPlacementCandidates(state, mover);
    if (purposeful.length > 0) {
      candidates.push(...purposeful);
    } else if (candidates.length === 0) {
      // Geen pion-zet, geen hulpstuk-zet, en geen enkele plaatsing heeft
      // aantoonbaar effect — dan toch alle legale plaatsingen als noodgreep,
      // zodat de bot nooit zijn beurt hoeft over te slaan terwijl er wél een
      // legale zet bestaat (zou anders zeldzaam maar mogelijk zijn, zie
      // MAX_BOUNCE_DEPTH-begrensde padverkenning hierboven).
      candidates.push(...allToolPlacementCandidates(state, mover));
    }
  }

  if (mover === botIdentity) {
    const forbidden = recentOwnPawnPositions(state, mover);
    if (forbidden.length > 0) {
      const filtered = candidates.filter((cand) => {
        if (!cand.isPawnMove) return true;
        const dest = cand.resultState.pawnPos[mover];
        return !forbidden.some(([r, c]) => dest[0] === r && dest[1] === c);
      });
      if (filtered.length > 0) return filtered;
    }
  }

  return candidates;
}

// Minimax met alfa-bèta-afkapping en een breedte-limiet (topK) in de
// recursieve lagen, zodat dieper zoeken haalbaar blijft. Kandidaten worden
// eerst gesorteerd op hun eigen, directe heuristiek — dat is zowel een
// redelijke aanname voor hoe de zet-nde speler zelf zou kiezen, als goede
// move-ordering voor de alfa-bèta-afkapping. Geeft TIMEOUT terug (en stopt
// meteen met verder zoeken) zodra het tijdsbudget van deze beurt verstrijkt.
function search(state, mover, botPerspective, depth, topK, alpha, beta, deadline) {
  if (state.winner || depth === 0) return evaluate(state, botPerspective);
  if (performance.now() > deadline) return TIMEOUT;

  const candidates = generateCandidates(state, mover, botPerspective);
  if (candidates.length === 0) return evaluate(state, botPerspective);

  const scored = candidates.map((c) => ({ ...c, sortScore: evaluate(c.resultState, mover) }));
  scored.sort((a, b) => b.sortScore - a.sortScore);
  const top = scored.slice(0, topK);
  const maximizing = mover === botPerspective;
  let best = maximizing ? -Infinity : Infinity;

  for (const { resultState } of top) {
    const score = search(resultState, otherPlayer(mover), botPerspective, depth - 1, topK, alpha, beta, deadline);
    if (score === TIMEOUT) return TIMEOUT;
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

// Eén iteratie van iterative deepening: doorzoekt alle wortel-kandidaten tot
// `depth` plies diep. Geeft { completed: false } terug zodra het budget
// halverwege verstrijkt — die halfafgeronde uitkomst wordt dan genegeerd en
// de laatst volledig afgeronde diepte blijft de gekozen zet (zie
// chooseComputerTurn).
function searchRoot(scoredRootCandidates, bot, depth, topK, deadline, jitter) {
  // Begint met de eerste kandidaat als vaste keuze (i.p.v. null) — als élke
  // kandidaat op een verloren stelling uitkomt (score exact -Infinity, een
  // geforceerd verlies dat de tegenstander hoe dan ook afdwingt), zou
  // "score > bestScore" met bestScore = -Infinity nooit waar worden en dus
  // nooit een kandidaat kiezen. Dan is geen enkele zet "beter", maar er moet
  // alsnog wél een zet gekozen worden — vandaar deze veilige starterswaarde.
  let bestAction = scoredRootCandidates[0].action;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const { action, resultState } of scoredRootCandidates) {
    if (performance.now() > deadline) return { completed: false };
    let score = search(resultState, otherPlayer(bot), bot, depth - 1, topK, alpha, beta, deadline);
    if (score === TIMEOUT) return { completed: false };
    if (jitter) score += (Math.random() - 0.5) * JITTER;
    if (score > bestScore) { bestScore = score; bestAction = action; }
    if (score > alpha) alpha = score;
  }
  return { completed: true, action: bestAction };
}

// Bepaalt de volledige beurt van de computerspeler: welk stuk (of nieuw
// hulpstuk) waarheen. `difficulty` is een van DIFFICULTIES (standaard
// "medium"). Geeft null terug als er werkelijk geen enkele geldige actie
// bestaat (zou in de praktijk niet moeten voorkomen).
export function chooseComputerTurn(state, bot, difficulty = "medium") {
  const candidates = generateCandidates(state, bot, bot);
  if (candidates.length === 0) return null;

  const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;

  if (config.randomFromCandidates) {
    return candidates[Math.floor(Math.random() * candidates.length)].action;
  }

  const deadline = performance.now() + config.timeBudgetMs;
  const scoredRoot = candidates
    .map((c) => ({ ...c, sortScore: evaluate(c.resultState, bot) }))
    .sort((a, b) => b.sortScore - a.sortScore);

  // Veilige terugvaloptie: de beste directe zet volgens de heuristiek,
  // zonder vooruitkijken — wordt overschreven zodra diepte 1 volledig
  // afrondt, en daarna telkens door een diepere, volledig afgeronde iteratie.
  let bestAction = scoredRoot[0].action;
  for (let depth = 1; depth <= config.maxDepth && performance.now() < deadline; depth++) {
    const result = searchRoot(scoredRoot, bot, depth, config.topK, deadline, config.jitter);
    if (!result.completed) break;
    bestAction = result.action;
  }
  return bestAction;
}
