"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useTranslation, translateAuthError } from "@/lib/i18n";
import { Logo } from "@/lib/ui";

// Volle-breedte foto van het echte fysieke bord als achtergrond (i.p.v. een
// herhalend houtprint-patroon), met een donkere overlay eroverheen — zelfde
// donkere, fotografie-gedreven sfeer als de Collision-pagina op
// mosquitogames.nl zelf (het bord IS het merk, dus geen aparte losse
// illustratie of textuur nodig).
export default function LoginPage() {
  const router = useRouter();
  const t = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(translateAuthError(t, error.message)); return; }
    router.push("/lobby");
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{
        // Effen achtergrondkleur als fallback (donker, past bij de foto)
        // zolang de afbeelding nog laadt — of áls die om wat voor reden dan
        // ook niet laadt, in plaats van dat dan het onderliggende
        // thema-vlak van <body> zichtbaar wordt.
        backgroundColor: "#17140f",
        backgroundImage:
          "linear-gradient(180deg, rgba(10,8,5,0.55) 0%, rgba(10,8,5,0.72) 55%, rgba(10,8,5,0.92) 100%), url(/images/board-hero.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center 42%",
        // Geen background-attachment: fixed — dat faalt op iOS Safari vaak
        // stil (de hele achtergrond-afbeelding verdwijnt dan), waardoor je
        // alsnog het onderliggende thema (bv. Woody's houtnerf) door <main>
        // heen zag i.p.v. deze bordfoto.
      }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <Link href="/" style={{ textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Logo size={44} />
          <p className="text-xs mono" style={{ color: "var(--maple)", opacity: 0.85, textAlign: "center", letterSpacing: "0.02em" }}>
            {t("landing.tagline")}
          </p>
        </Link>

        <form
          onSubmit={handleSubmit}
          className="panel w-full flex flex-col gap-4"
          style={{ background: "rgba(34, 30, 26, 0.88)", boxShadow: "0 12px 36px rgba(0,0,0,0.5)" }}
        >
          <h1 className="text-lg font-bold uppercase tracking-widest">{t("login.title")}</h1>
          <input className="input" type="email" placeholder={t("login.emailPlaceholder")} value={email}
            onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder={t("login.passwordPlaceholder")} value={password}
            onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="text-sm" style={{ color: "#e07a5f" }}>{error}</p>}
          <button className="btn btn-solid" disabled={loading}>
            {loading ? t("common.busy") : t("login.title")}
          </button>
          <p className="text-xs mono" style={{ color: "var(--muted)" }}>
            {t("login.noAccount")} <a href="/register" className="underline">{t("login.registerLink")}</a>
          </p>
        </form>
      </div>
    </main>
  );
}
