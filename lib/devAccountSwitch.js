// Ontwikkelaarsgemak: snel wisselen tussen de "JorADMIN"- en "Joram"-
// accounts tijdens het testen, zonder er telkens voor uit te loggen en
// opnieuw in te loggen. Zodra je met een van deze twee accounts bent
// ingelogd, wordt de sessie (access/refresh-token) lokaal bewaard onder
// die gebruikersnaam — daarna kan er met één klik naar overgeschakeld
// worden (zie de "Wissel naar ..."-knop in app/(app)/layout.js).
//
// Puur lokaal (localStorage) en uitsluitend voor deze twee gebruikersnamen
// — voor iedere andere gebruiker doet dit bestand niets.

const STORAGE_KEY = "collision-dev-sessions";
const DEV_USERNAMES = ["JorADMIN", "Joram"];

export function isDevAccount(username) {
  return DEV_USERNAMES.includes(username);
}

function readSessions() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSessions(sessions) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

// Bewaart (of ververst) de huidige sessie onder de meegegeven
// gebruikersnaam. Wordt bij elk paginabezoek aangeroepen zodra een van de
// twee dev-accounts is ingelogd, zodat de bewaarde tokens niet verouderen.
export function rememberDevSession(username, session) {
  if (!isDevAccount(username) || !session?.access_token || !session?.refresh_token) return;
  const sessions = readSessions();
  sessions[username] = { access_token: session.access_token, refresh_token: session.refresh_token };
  writeSessions(sessions);
}

// De "andere" dev-gebruikersnaam waarnaar gewisseld kan worden, of null als
// er (nog) geen bewaarde sessie voor die andere gebruiker is — dan moet er
// eerst één keer met dat account ingelogd worden.
export function otherDevAccount(username) {
  if (!isDevAccount(username)) return null;
  const other = DEV_USERNAMES.find((u) => u !== username);
  return readSessions()[other] ? other : null;
}

export function getDevSession(username) {
  return readSessions()[username] || null;
}
