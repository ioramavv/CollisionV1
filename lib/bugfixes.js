// Beknopte lijst van opgeloste bugs, getoond onderaan de lobbypagina.
// Nieuwste bovenaan. Handmatig bijgehouden — puur communicatie naar
// gebruikers, geen gekoppelde data-bron.
export const BUGFIXES = [
  {
    date: "2026-08-06",
    title: "Kon tijdens je beurt niet meer van gedachten veranderen",
    detail: "Zodra je een pion of hulpstuk had bewogen, zat je daaraan vast — je kon niet meer terug om alsnog een ander stuk te kiezen of een hulpstuk te plaatsen. Er is nu een \"Annuleer beurt\"-knop die je beurt teruggooit naar het beginpunt, en nogmaals tikken op je geselecteerde stuk (vóór je bewogen hebt) deselecteert het weer.",
  },
  {
    date: "2026-08-06",
    title: "Pagina zoomde vanzelf in bij het openen van de chat",
    detail: "Het chatveld kreeg meteen focus en had een lettergrootte onder de 16px-grens waarop iOS Safari daarbij automatisch inzoomt. Lettergrootte aangepast, en handmatig in-/uitzoomen op alle pagina's meteen helemaal uitgezet zodat de layout altijd blijft kloppen.",
  },
  {
    date: "2026-08-06",
    title: "Vaste elementen zaten niet echt vast aan het scherm",
    detail: "Door een neveneffect van de pagina-schuifanimatie bleven position:fixed-elementen (zoals de winnaarsoverlay) eigenlijk meescrollen met de pagina in plaats van op hun plek te blijven staan. Verholpen door de animatie geen blijvende, onzichtbare transform meer te laten achterlaten.",
  },
  {
    date: "2026-08-03",
    title: "Naamplaten bij het bord overlapten op mobiel",
    detail: "De speler-naamplaten aan de hoeken van het bord staken op kleinere (mobiele) bordformaten deels over de rand heen. Ze krijgen nu echte, gereserveerde ruimte boven en onder het bord, zodat ze op elk schermformaat volledig los staan.",
  },
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
