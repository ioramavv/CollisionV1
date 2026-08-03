// Beknopte lijst van opgeloste bugs, getoond onderaan de lobbypagina.
// Nieuwste bovenaan. Handmatig bijgehouden — puur communicatie naar
// gebruikers, geen gekoppelde data-bron.
export const BUGFIXES = [
  {
    date: "2026-08-03",
    title: "Insluitregel blokkeerde ten onrechte doorschuiven",
    detail: "Je kon niet meer over of op een insluitende positie heen bewegen tijdens een stuiterketen, zelfs niet als je beurt daar niet eindigde. Dat mag nu weer — de regel wordt alleen nog gecontroleerd op het moment dat een beurt daadwerkelijk stopt.",
  },
  {
    title: "Computerspeler zag een dreigende winst niet",
    detail: "De AI keek alleen naar hemelsbrede afstand tot het centrum, niet naar echte stuiterpaden. Daardoor blokkeerde hij dreigende zetten van de tegenstander niet, en miste hij ook geregeld zijn eigen winskansen.",
  },
  {
    title: "Partijen bleven op \"actief\" staan na winst",
    detail: "De status van een partij werd niet altijd op \"afgerond\" gezet zodra iemand won, waardoor gewonnen partijen bleven hangen in de lobbylijsten.",
  },
  {
    title: "Feedback verscheen niet in het adminpaneel",
    detail: "Een verouderde schrijfwijze in de admin-check zorgde dat binnengekomen feedback niet zichtbaar was voor de admin.",
  },
  {
    title: "Adminpagina keek naar de verkeerde gebruikersnaam",
    detail: "De admin-toegang was per ongeluk gekoppeld aan \"jorADMIN\" i.p.v. \"JorADMIN\" (hoofdlettergevoelig).",
  },
  {
    title: "Zelfinsluiting werd niet altijd herkend",
    detail: "Een zet kon in sommige gevallen je eigen pion volledig afsluiten van het centrum zonder dat het spel dat tegenhield.",
  },
];
