"use client";
import Link from "next/link";
import { Logo } from "@/lib/ui";
import { useTranslation } from "@/lib/i18n";

// Zelfde volle-breedte bordfoto + donkere overlay als de inlogpagina (zie
// app/login/page.js) — bewust geen background-attachment: fixed, dat faalt
// op iOS Safari vaak stilletjes (zie de fix daar).
export default function Home() {
  const t = useTranslation();
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 text-center gap-8"
      style={{
        backgroundColor: "#17140f",
        backgroundImage:
          "linear-gradient(180deg, rgba(10,8,5,0.55) 0%, rgba(10,8,5,0.72) 55%, rgba(10,8,5,0.92) 100%), url(/images/board-hero.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center 42%",
      }}
    >
      <div>
        <h1 className="flex items-center justify-center">
          <Logo size={56} />
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--maple)", opacity: 0.9 }}>
          {t("landing.tagline")}
        </p>
        <p className="mt-2 text-xs mono" style={{ color: "var(--muted)" }}>
          {t("landing.subtitle")}
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/login" className="btn">{t("login.title")}</Link>
        <Link href="/register" className="btn btn-solid">{t("register.title")}</Link>
      </div>
    </main>
  );
}
