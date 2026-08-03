import { Poppins } from "next/font/google";
import "./globals.css";
import PageTransition from "./PageTransition";

// Alleen gebruikt voor het logo-woordmerk (zie lib/ui.js), niet voor de
// rest van de tekst — vandaar een losse CSS-variabele i.p.v. de globale
// body-font te vervangen.
const poppins = Poppins({ subsets: ["latin"], weight: "900", variable: "--font-poppins" });

export const metadata = {
  title: "Collision — collision.iorama.nl",
  description: "Online versie van Collision, het bordspel van Mosquito Games.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl" className={poppins.variable}>
      <body>
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
