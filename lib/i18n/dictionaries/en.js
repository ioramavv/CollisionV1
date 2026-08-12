// Engels — de standaardtaal en de terugval voor ontbrekende keys in andere
// woordenboeken (zie lib/i18n/index.js). Platte, dot-namespaced keys, zelfde
// stijl als lib/siteContent.js. Waarden zijn ofwel een vaste string, ofwel
// een functie (params) => string voor teksten met een ingevulde naam/getal,
// omdat woordvolgorde per taal verschilt.
const en = {
  "common.busy": "Working...",
  "common.delete": "Delete",
  "common.view": "View",
  "common.unknown": "unknown",
  "common.beta": "(beta)",
  "common.accept": "Accept",
  "common.close": "Close",

  "layout.nav.lobby": "Lobby",
  "layout.nav.friends": "Friends",
  "layout.nav.tutorial": "How to play",
  "layout.nav.profile": "Profile",
  "layout.nav.feedback": "Feedback",
  "layout.nav.admin": "Admin",
  "layout.nav.signOut": "Sign out",
  "layout.account.openMenu": "Open account menu",
  "layout.language.choose": "Choose language",
  "layout.feedback.thanks": "Thanks for your feedback!",
  "layout.feedback.placeholder": "What would you like to share?",
  "layout.feedback.send": "Send",
  "layout.feedback.sending": "Sending...",
  "layout.feedback.error": ({ message }) => `Failed to send: ${message}`,

  "lobby.section.myTurn": "Your turn",
  "lobby.section.theirTurn": "Opponent's turn",
  "lobby.section.finished": "Recently finished",
  "lobby.section.quickPlay": "Quick play",
  "lobby.section.stats": "Statistics",
  "lobby.section.archived": "Archived games",
  "lobby.section.open": "Open games",
  "lobby.section.invites": "Invitations for you",

  "lobby.card.invite.title": "Invite a friend",
  "lobby.card.invite.sub": "Play 1-on-1",
  "lobby.card.computer.title": "Vs. the computer",
  "lobby.card.computer.sub": "4 levels",
  "lobby.card.local.title": "Local play",
  "lobby.card.local.sub": "Together on one device",
  "lobby.card.open.title": "Open game",
  "lobby.card.open.sub": "Anyone can join",
  "lobby.card.tutorial.title": "How to play",
  "lobby.card.tutorial.sub": "Learn the rules",

  "lobby.modal.title": "New game",
  "lobby.modal.local.intro": "Take turns against each other on this device — handy if you're sitting together on the couch. Nothing is shared with another account.",
  "lobby.modal.local.player1Label": "Player 1 name (brown)",
  "lobby.modal.local.player1Placeholder": "Player 1",
  "lobby.modal.local.player2Label": "Player 2 name (white)",
  "lobby.modal.local.player2Placeholder": "Player 2",
  "lobby.modal.local.start": "Start local game",
  "lobby.modal.computer.betaWarning": "Beta: the computer player is still under development and doesn't always play well or flawlessly.",
  "lobby.modal.computer.chooseDifficulty": "Choose a difficulty:",
  "lobby.modal.invite.yourFriends": "Your friends",
  "lobby.modal.invite.invite": "Invite",
  "lobby.modal.invite.orSearch": "Or search for someone else",
  "lobby.modal.invite.searchPlaceholder": "Search by username...",

  "lobby.difficulty.easy": "Easy",
  "lobby.difficulty.medium": "Medium",
  "lobby.difficulty.hard": "Hard",
  "lobby.difficulty.expert": "Expert",

  "lobby.devSwitch.switchTo": ({ target }) => `Switch to ${target}`,
  "lobby.devSwitch.tooltip": ({ target }) => `Log in as ${target} once first to be able to switch`,

  "lobby.invite.from": ({ name }) => `${name} invites you`,

  "lobby.game.withOpponent": ({ name }) => `Game with ${name}`,
  "lobby.game.generic": "Game",
  "lobby.badge.waitingForOpponent": "waiting for opponent",
  "lobby.badge.local": "local",
  "lobby.badge.won": "won",
  "lobby.badge.lost": "lost",
  "lobby.badge.wonBy": ({ name }) => `${name} won`,

  "lobby.actions.viewGame": "View game",
  "lobby.actions.archive": "Archive",
  "lobby.actions.ignore": "Ignore",
  "lobby.actions.join": "Join",

  "lobby.stats.rating": "Rating",
  "lobby.stats.active": "Active",
  "lobby.stats.won": "Won",
  "lobby.stats.lost": "Lost",

  "lobby.openGame.waiting": ({ name }) => `${name} is waiting for an opponent`,

  "lobby.bugfixes.title": "Fixed bugs",

  "lobby.confirm.deleteGame": "Delete this game?",
  "lobby.error.gameTaken": "Someone else beat you to it — this game is no longer available.",
  "lobby.error.deleteFailed": ({ message }) => `Failed to delete: ${message}`,
  "lobby.error.archiveFailed": ({ message }) => `Failed to archive: ${message}`,
  "lobby.error.dismissFailed": ({ message }) => `Failed to ignore: ${message}`,
};

export default en;
