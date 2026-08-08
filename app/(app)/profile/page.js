"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Avatar, BoardLoader } from "@/lib/ui";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(null);

  const [usernameInput, setUsernameInput] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [usernameError, setUsernameError] = useState(null);

  const [emailInput, setEmailInput] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);
      setEmailInput(user.email || "");

      const { data } = await supabase.from("profiles").select("username, avatar_url").eq("id", user.id).single();
      setProfile(data);
      setUsernameInput(data?.username || "");
      setLoading(false);
    })();
  }, [router]);

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // zelfde bestand nogmaals kunnen kiezen werkt anders niet
    if (!file) return;
    if (!file.type.startsWith("image/")) { setAvatarError("Kies een afbeeldingsbestand."); return; }
    if (file.size > 2 * 1024 * 1024) { setAvatarError("Bestand is te groot (max 2MB)."); return; }

    setAvatarUploading(true);
    setAvatarError(null);

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, cacheControl: "3600" });
    if (uploadError) {
      setAvatarUploading(false);
      setAvatarError("Uploaden mislukt: " + uploadError.message);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    // Cache-busting: dezelfde bestandsnaam/URL zou anders een oude,
    // gecachede foto kunnen blijven tonen na het vervangen ervan.
    const bustUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase.from("profiles").update({ avatar_url: bustUrl }).eq("id", user.id);
    setAvatarUploading(false);
    if (updateError) { setAvatarError("Opslaan mislukt: " + updateError.message); return; }
    setProfile((p) => ({ ...p, avatar_url: bustUrl }));
  }

  async function saveUsername(e) {
    e.preventDefault();
    const trimmed = usernameInput.trim();
    if (!trimmed || trimmed === profile.username) return;
    setUsernameSaving(true);
    setUsernameError(null);
    setUsernameSaved(false);
    const { error } = await supabase.from("profiles").update({ username: trimmed }).eq("id", user.id);
    setUsernameSaving(false);
    if (error) {
      setUsernameError(error.code === "23505" ? "Deze gebruikersnaam is al in gebruik." : "Opslaan mislukt: " + error.message);
      return;
    }
    setProfile((p) => ({ ...p, username: trimmed }));
    setUsernameSaved(true);
  }

  async function saveEmail(e) {
    e.preventDefault();
    const trimmed = emailInput.trim();
    if (!trimmed || trimmed === user.email) return;
    setEmailSaving(true);
    setEmailError(null);
    setEmailSaved(false);
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    setEmailSaving(false);
    if (error) { setEmailError("Wijzigen mislukt: " + error.message); return; }
    setEmailSaved(true);
  }

  async function savePassword(e) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);
    if (newPassword.length < 6) { setPasswordError("Wachtwoord moet minimaal 6 tekens zijn."); return; }
    if (newPassword !== confirmPassword) { setPasswordError("Wachtwoorden komen niet overeen."); return; }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) { setPasswordError("Wijzigen mislukt: " + error.message); return; }
    setPasswordSaved(true);
    setNewPassword("");
    setConfirmPassword("");
  }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><BoardLoader /></main>;

  return (
    <main className="min-h-screen px-4 py-10 max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="text-xl font-extrabold uppercase tracking-widest">Profielinstellingen</h1>

      <section className="panel flex flex-col items-center gap-3">
        <div style={{ position: "relative" }}>
          <Avatar username={profile?.username} avatarUrl={profile?.avatar_url} size={84} />
          <label
            className="btn btn-icon btn-solid"
            style={{ position: "absolute", bottom: -4, right: -4, cursor: "pointer" }}
            title="Profielfoto wijzigen"
          >
            <Camera size={14} />
            <input type="file" accept="image/*" onChange={handleAvatarChange} disabled={avatarUploading} style={{ display: "none" }} />
          </label>
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {avatarUploading ? "Bezig met uploaden..." : "Tik op het camera-icoontje om een foto te kiezen (max 2MB)."}
        </p>
        {avatarError && <p className="text-xs" style={{ color: "#e07a5f" }}>{avatarError}</p>}
      </section>

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
          Naam
        </h2>
        <form onSubmit={saveUsername} className="flex items-center gap-2">
          <input
            type="text"
            className="input flex-1"
            value={usernameInput}
            onChange={(e) => { setUsernameInput(e.target.value); setUsernameSaved(false); }}
            maxLength={30}
          />
          <button className="btn btn-solid" type="submit" disabled={usernameSaving || !usernameInput.trim() || usernameInput.trim() === profile?.username}>
            {usernameSaving ? "Bezig..." : "Opslaan"}
          </button>
        </form>
        {usernameError && <p className="text-xs mt-2" style={{ color: "#e07a5f" }}>{usernameError}</p>}
        {usernameSaved && <p className="text-xs mt-2 flex items-center gap-1" style={{ color: "#9db98a" }}><Check size={13} /> Opgeslagen.</p>}
      </section>

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
          E-mailadres
        </h2>
        <form onSubmit={saveEmail} className="flex items-center gap-2">
          <input
            type="email"
            className="input flex-1"
            value={emailInput}
            onChange={(e) => { setEmailInput(e.target.value); setEmailSaved(false); }}
          />
          <button className="btn btn-solid" type="submit" disabled={emailSaving || !emailInput.trim() || emailInput.trim() === user?.email}>
            {emailSaving ? "Bezig..." : "Opslaan"}
          </button>
        </form>
        {emailError && <p className="text-xs mt-2" style={{ color: "#e07a5f" }}>{emailError}</p>}
        {emailSaved && (
          <p className="text-xs mt-2" style={{ color: "#9db98a" }}>
            Bevestigingsmail verstuurd — klik op de link in die mail om je nieuwe e-mailadres te bevestigen.
          </p>
        )}
      </section>

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
          Wachtwoord wijzigen
        </h2>
        <form onSubmit={savePassword} className="flex flex-col gap-2">
          <input
            type="password"
            className="input"
            placeholder="Nieuw wachtwoord"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setPasswordSaved(false); }}
          />
          <input
            type="password"
            className="input"
            placeholder="Bevestig nieuw wachtwoord"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setPasswordSaved(false); }}
          />
          {passwordError && <p className="text-xs" style={{ color: "#e07a5f" }}>{passwordError}</p>}
          {passwordSaved && <p className="text-xs flex items-center gap-1" style={{ color: "#9db98a" }}><Check size={13} /> Wachtwoord gewijzigd.</p>}
          <button className="btn btn-solid" type="submit" disabled={passwordSaving || !newPassword || !confirmPassword}>
            {passwordSaving ? "Bezig..." : "Wachtwoord wijzigen"}
          </button>
        </form>
      </section>
    </main>
  );
}
