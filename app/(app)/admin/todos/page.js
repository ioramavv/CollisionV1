"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Check, Square, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { BoardLoader } from "@/lib/ui";

// Privé planninglijstje voor de admin (JorADMIN) — een plek om verzoeken/
// ideeën te verzamelen die later samen afgewerkt worden, i.p.v. verspreid
// over losse chatberichten. Puur voor eigen gebruik: alleen leesbaar/
// schrijfbaar voor de admin zelf (zie RLS op admin_todos in schema.sql).
export default function AdminTodosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [todos, setTodos] = useState([]);
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    let channel;

    async function refreshTodos() {
      const { data } = await supabase
        .from("admin_todos")
        .select("id, text, done, created_at, done_at")
        .order("created_at", { ascending: true });
      if (active) setTodos(data || []);
    }

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
      if (profile?.username !== "JorADMIN") { router.push("/lobby"); return; }
      if (!active) return;
      setAllowed(true);

      await refreshTodos();
      if (!active) return;
      setLoading(false);

      channel = supabase
        .channel("admin-todos-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "admin_todos" }, refreshTodos)
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [router]);

  async function addTodo(e) {
    e.preventDefault();
    const text = newText.trim();
    if (!text) return;
    setAdding(true);
    setError(null);
    const { error } = await supabase.from("admin_todos").insert({ text });
    setAdding(false);
    if (error) { setError("Toevoegen mislukt: " + error.message); return; }
    setNewText("");
  }

  async function toggleDone(todo) {
    setError(null);
    const { error } = await supabase
      .from("admin_todos")
      .update({ done: !todo.done, done_at: !todo.done ? new Date().toISOString() : null })
      .eq("id", todo.id);
    if (error) setError("Bijwerken mislukt: " + error.message);
  }

  async function deleteTodo(id) {
    if (!window.confirm("Deze to-do verwijderen?")) return;
    setError(null);
    const { error } = await supabase.from("admin_todos").delete().eq("id", id);
    if (error) setError("Verwijderen mislukt: " + error.message);
  }

  if (loading || !allowed) return <main className="min-h-screen flex items-center justify-center"><BoardLoader /></main>;

  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  return (
    <main className="min-h-screen px-4 py-10 max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Link className="btn btn-icon" href="/admin"><ArrowLeft size={16} /></Link>
        <h1 className="text-xl font-extrabold uppercase tracking-widest">To-do&apos;s</h1>
      </div>

      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Verzamel hier verzoeken/ideeën voor Claude, zodat we ze samen kunnen afwerken i.p.v.
        verspreid over losse berichten. Alleen jij ziet dit lijstje.
      </p>

      {error && <p className="text-sm" style={{ color: "#e07a5f" }}>{error}</p>}

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
          Open ({open.length})
        </h2>
        <form onSubmit={addTodo} className="flex items-center gap-2 mb-3">
          <input
            type="text"
            className="input flex-1"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Nieuwe to-do..."
            maxLength={500}
          />
          <button className="btn btn-icon btn-solid" type="submit" disabled={adding || !newText.trim()}>
            <Plus size={16} />
          </button>
        </form>
        {open.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Niks openstaand — lekker bezig.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <button
                  className="clickable-row flex items-center gap-2 flex-1"
                  style={{ background: "none", border: "none", textAlign: "left", padding: 0, color: "var(--text)", cursor: "pointer" }}
                  onClick={() => toggleDone(t)}
                >
                  <Square size={16} style={{ flexShrink: 0, color: "var(--muted)" }} />
                  {t.text}
                </button>
                <button className="btn btn-icon" title="Verwijderen" onClick={() => deleteTodo(t.id)}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            Afgerond ({done.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {done.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <button
                  className="clickable-row flex items-center gap-2 flex-1"
                  style={{ background: "none", border: "none", textAlign: "left", padding: 0, color: "var(--muted)", textDecoration: "line-through", cursor: "pointer" }}
                  onClick={() => toggleDone(t)}
                >
                  <Check size={16} style={{ flexShrink: 0, color: "#9db98a" }} />
                  {t.text}
                </button>
                <button className="btn btn-icon" title="Verwijderen" onClick={() => deleteTodo(t.id)}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
