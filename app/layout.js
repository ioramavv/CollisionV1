import "./globals.css";

export const metadata = {
  title: "Collision — collision.iorama.nl",
  description: "Online versie van Collision, het bordspel van Mosquito Games.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
