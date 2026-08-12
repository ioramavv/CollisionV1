"use client";
import Link from "next/link";
import { Logo } from "@/lib/ui";
import { useTranslation } from "@/lib/i18n";

export default function Home() {
  const t = useTranslation();
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center gap-6">
      <div>
        <h1 className="flex items-center justify-center">
          <Logo size={56} />
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          {t("landing.tagline")}
        </p>
        <p className="mt-2 text-xs mono" style={{ color: "var(--muted)", opacity: 0.75 }}>
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
