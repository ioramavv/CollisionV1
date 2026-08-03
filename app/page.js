import Link from "next/link";
import { Logo } from "@/lib/ui";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center gap-6">
      <div>
        <h1 className="flex items-center justify-center">
          <Logo size={56} />
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          bereik als eerste het centrum · stuiterbeweging · 5 hulpstukken per speler
        </p>
        <p className="mt-2 text-xs mono" style={{ color: "var(--muted)", opacity: 0.75 }}>
          online versie van het bordspel van Mosquito Games
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/login" className="btn">Inloggen</Link>
        <Link href="/register" className="btn btn-solid">Account aanmaken</Link>
      </div>
    </main>
  );
}
