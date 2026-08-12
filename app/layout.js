import { Poppins } from "next/font/google";
import "./globals.css";
import PageTransition from "./PageTransition";
import { LanguageProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";

// Alleen gebruikt voor het logo-woordmerk (zie lib/ui.js), niet voor de
// rest van de tekst — vandaar een losse CSS-variabele i.p.v. de globale
// body-font te vervangen.
const poppins = Poppins({ subsets: ["latin"], weight: "900", variable: "--font-poppins" });

export const metadata = {
  title: "Collision — collision.iorama.nl",
  description: "Online versie van Collision, het bordspel van Mosquito Games.",
};

// Zet-in/uitzoomen staat uit — de pagina's zijn overal op ontworpen om
// precies in het scherm te passen (zie o.a. de vaste actiebalk op de
// spelpagina), dus (per ongeluk) inzoomen levert alleen maar een layout op
// die niet meer klopt.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    // lang="en" is de eerste-paint-fallback (Engels is nu de standaardtaal)
    // — LanguageProvider zet dit client-side bij zodra de echte taal bekend
    // is (account-instelling of localStorage, zie lib/i18n/index.js).
    <html lang="en" className={poppins.variable}>
      <body>
        <ThemeProvider>
          <LanguageProvider>
            <PageTransition>{children}</PageTransition>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
