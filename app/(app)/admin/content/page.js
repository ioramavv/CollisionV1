"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Undo2, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { BoardLoader } from "@/lib/ui";
import { DEFAULT_CONTENT, CONTENT_GROUPS } from "@/lib/siteContent";

// Content-editor: laat de admin losse teksten (sectietitels, kaartjes,
// uitlegpagina-stappen) overschrijven zonder code te wijzigen. Alleen
// keys die van de standaardtekst afwijken worden in site_content
// bewaard — zie lib/siteContent.js voor de standaardwaarden en hoe de
// rest van de site deze overrides toepast (useSiteContent()).
export default function AdminContentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [saved, setSaved] = useState({}); // wat er nu daadwerkelijk in de database staat
  const [form, setForm] = useState({}); // lokale, nog niet opgeslagen bewerking
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
      if (profile?.username !== "JorADMIN") { router.push("/lobby"); return; }
      setAllowed(true);

      const { data } = await supabase.from("site_content").select("key, value");
      const overrides = {};
      (data || []).forEach((row) => { overrides[row.key] = row.value; });
      setSaved(overrides);
      setForm({ ...DEFAULT_CONTENT, ...overrides });
      setLoading(false);
    })();
  }, [router]);

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setJustSaved(false);
  }

  function resetField(key) {
    updateField(key, DEFAULT_CONTENT[key]);
  }

  const isDirty = CONTENT_GROUPS.some((group) =>
    group.keys.some(({ key }) => (form[key] ?? "") !== (saved[key] ?? DEFAULT_CONTENT[key]))
  );

  async function saveAll() {
    setSaving(true);
    setSaveError(null);
    const upserts = [];
    const deleteKeys = [];
    for (const group of CONTENT_GROUPS) {
      for (const { key } of group.keys) {
        const value = (form[key] ?? "").trim();
        const isDefault = value === DEFAULT_CONTENT[key] || !value;
        if (isDefault) {
          if (key in saved) deleteKeys.push(key);
        } else if (value !== saved[key]) {
          upserts.push({ key, value });
        }
      }
    }

    if (upserts.length) {
      const { error } = await supabase.from("site_content").upsert(upserts);
      if (error) { setSaving(false); setSaveError("Opslaan mislukt: " + error.message); return; }
    }
    if (deleteKeys.length) {
      const { error } = await supabase.from("site_content").delete().in("key", deleteKeys);
      if (error) { setSaving(false); setSaveError("Opslaan mislukt: " + error.message); return; }
    }

    const nextSaved = { ...saved };
    upserts.forEach((row) => { nextSaved[row.key] = row.value; });
    deleteKeys.forEach((key) => { delete nextSaved[key]; });
    setSaved(nextSaved);
    setSaving(false);
    setJustSaved(true);
  }

  if (loading || !allowed) return <main className="min-h-screen flex items-center justify-center"><BoardLoader /></main>;

  return (
    <main className="min-h-screen px-4 py-10 max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link className="btn btn-icon" href="/admin"><ArrowLeft size={16} /></Link>
          <h1 className="text-xl font-extrabold uppercase tracking-widest">Site-inhoud</h1>
        </div>
        <button className="btn btn-solid" onClick={saveAll} disabled={saving || !isDirty}>
          {saving ? "Bezig..." : justSaved ? <><Check size={15} /> Opgeslagen</> : "Wijzigingen opslaan"}
        </button>
      </div>

      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Pas hier losse teksten aan zoals ze op de site staan — sectietitels, kaartjes op de lobbypagina en de
        stappen op de uitlegpagina. Wijzigingen zijn voor iedereen meteen live na het opslaan. Een leeg veld of
        een klik op het pijltje herstelt de oorspronkelijke tekst.
      </p>

      {saveError && <p className="text-sm" style={{ color: "#e07a5f" }}>{saveError}</p>}

      {CONTENT_GROUPS.map((group) => (
        <section key={group.label} className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            {group.label}
          </h2>
          <div className="flex flex-col gap-3">
            {group.keys.map(({ key, label, multiline }) => {
              const value = form[key] ?? "";
              const overridden = value !== DEFAULT_CONTENT[key];
              return (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                    {label}
                    {overridden && (
                      <button
                        className="btn btn-icon"
                        style={{ padding: "2px 4px" }}
                        title="Herstel naar standaardtekst"
                        onClick={() => resetField(key)}
                      >
                        <Undo2 size={12} />
                      </button>
                    )}
                  </label>
                  {multiline ? (
                    <textarea
                      className="input"
                      rows={2}
                      value={value}
                      onChange={(e) => updateField(key, e.target.value)}
                    />
                  ) : (
                    <input
                      type="text"
                      className="input"
                      value={value}
                      onChange={(e) => updateField(key, e.target.value)}
                      maxLength={80}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
