"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push("/lobby");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="panel w-full max-w-sm flex flex-col gap-4">
        <h1 className="text-lg font-bold uppercase tracking-widest">Account aanmaken</h1>
        <input className="input" placeholder="Gebruikersnaam" value={username}
          onChange={(e) => setUsername(e.target.value)} required />
        <input className="input" type="email" placeholder="E-mailadres" value={email}
          onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Wachtwoord (min. 6 tekens)" value={password}
          onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        {error && <p className="text-sm" style={{ color: "#e07a5f" }}>{error}</p>}
        <button className="btn btn-solid" disabled={loading}>
          {loading ? "Bezig..." : "Registreren"}
        </button>
        <p className="text-xs mono" style={{ color: "var(--muted)" }}>
          Al een account? <a href="/login" className="underline">Log in</a>
        </p>
      </form>
    </main>
  );
}
