"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
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
    if (error) { setError(error.message); return; }
    router.push("/lobby");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="panel w-full max-w-sm flex flex-col gap-4">
        <h1 className="text-lg font-bold uppercase tracking-widest">Inloggen</h1>
        <input className="input" type="email" placeholder="E-mailadres" value={email}
          onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Wachtwoord" value={password}
          onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-sm" style={{ color: "#e07a5f" }}>{error}</p>}
        <button className="btn btn-solid" disabled={loading}>
          {loading ? "Bezig..." : "Inloggen"}
        </button>
        <p className="text-xs mono" style={{ color: "var(--muted)" }}>
          Nog geen account? <a href="/register" className="underline">Registreer</a>
        </p>
      </form>
    </main>
  );
}
