"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Search, UserPlus, Check, X, Ban, UserMinus, QrCode, Copy, Share2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Avatar, Rating, BoardLoader } from "@/lib/ui";

export default function FriendsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [friends, setFriends] = useState([]);
  const [error, setError] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    let channel;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);

      const { data: profileData } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
      setProfile(profileData);

      await refreshFriends(user.id);
      setLoading(false);

      channel = supabase
        .channel(`friendships-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => refreshFriends(user.id))
        .subscribe();
    }

    init();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [router]);

  // window/navigator zijn pas op de client beschikbaar, maar deze pagina
  // rendert sowieso pas inhoud na de auth-check hierboven (tot die klaar is
  // staat er alleen de BoardLoader) — dus geen hydratatie-mismatch-risico
  // door dit gewoon inline tijdens render te lezen i.p.v. via een effect.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  const inviteUrl = profile?.username && origin ? `${origin}/invite/${encodeURIComponent(profile.username)}` : null;

  useEffect(() => {
    if (!inviteUrl) return;
    let active = true;
    QRCode.toDataURL(inviteUrl, { margin: 1, width: 180, color: { dark: "#17140f", light: "#f0ece2" } })
      .then((url) => { if (active) setQrDataUrl(url); })
      .catch(() => {});
    return () => { active = false; };
  }, [inviteUrl]);

  async function copyInviteLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function shareInviteLink() {
    if (!inviteUrl) return;
    try {
      await navigator.share({ title: "Collision", text: "Speel Collision met mij — word mijn vriend:", url: inviteUrl });
    } catch {
      // Gebruiker annuleerde de deel-sheet — geen actie nodig.
    }
  }

  async function refreshFriends(userId) {
    const { data } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status, requester:requester_id(username, rating), addressee:addressee_id(username, rating)")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    const rows = data || [];
    setIncoming(rows.filter((r) => r.status === "pending" && r.addressee_id === userId));
    setOutgoing(rows.filter((r) => r.status === "pending" && r.requester_id === userId));
    setFriends(rows.filter((r) => r.status === "accepted"));
  }

  function otherUsername(row, userId) {
    return row.requester_id === userId ? row.addressee?.username : row.requester?.username;
  }

  function otherRating(row, userId) {
    return row.requester_id === userId ? row.addressee?.rating : row.requester?.rating;
  }

  async function searchUsers(e) {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, username")
      .ilike("username", `%${query}%`)
      .neq("id", user.id)
      .limit(8);
    setSearchResults(data || []);
    setSearching(false);
  }

  async function sendRequest(targetId) {
    setError(null);
    const { data: existing } = await supabase
      .from("friendships")
      .select("id, requester_id, status")
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${user.id})`)
      .maybeSingle();

    if (existing) {
      if (existing.status === "pending" && existing.requester_id === targetId) {
        await supabase.from("friendships").update({ status: "accepted" }).eq("id", existing.id);
      }
      await refreshFriends(user.id);
      return;
    }

    const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: targetId });
    if (error) setError("Vriendverzoek versturen mislukt: " + error.message);
    await refreshFriends(user.id);
  }

  async function acceptRequest(id) {
    await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
  }

  async function removeRequest(id) {
    await supabase.from("friendships").delete().eq("id", id);
  }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><BoardLoader /></main>;

  return (
    <main className="min-h-screen px-4 py-10 max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="text-xl font-extrabold uppercase tracking-widest">Vrienden</h1>

      {error && <p className="text-sm" style={{ color: "#e07a5f" }}>{error}</p>}

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: "var(--accent)" }}>
          <QrCode size={15} /> Uitnodigen via link
        </h2>
        <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
          Stuur deze link naar een vriend via WhatsApp, Signal, of laat &apos;m de QR-code scannen — jullie worden dan automatisch vrienden.
        </p>
        {inviteUrl && (
          <div className="flex flex-col md:flex-row gap-3 items-center md:items-start">
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR-code voor je uitnodigingslink"
                width={140}
                height={140}
                style={{ borderRadius: 8, border: "1px solid var(--panel-line)", flexShrink: 0 }}
              />
            )}
            <div className="flex flex-col gap-2 flex-1" style={{ minWidth: 0, width: "100%" }}>
              <div className="input mono text-xs" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {inviteUrl}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button className="btn" onClick={copyInviteLink}>
                  {linkCopied ? <Check size={15} /> : <Copy size={15} />} {linkCopied ? "Gekopieerd!" : "Kopieer link"}
                </button>
                {canShare && (
                  <button className="btn btn-solid" onClick={shareInviteLink}>
                    <Share2 size={15} /> Delen
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
          Vriend toevoegen
        </h2>
        <form onSubmit={searchUsers} className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Zoek op gebruikersnaam..."
            className="input flex-1"
          />
          <button className="btn btn-icon" type="submit" disabled={searching}><Search size={15} /></button>
        </form>
        {searchResults.length > 0 && (
          <ul className="flex flex-col gap-2 mt-3">
            {searchResults.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span className="mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                  <Avatar username={p.username} /> {p.username}
                </span>
                <button className="btn" onClick={() => sendRequest(p.id)}>
                  <UserPlus size={15} /> Vriend worden
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {incoming.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            Openstaande verzoeken
          </h2>
          <ul className="flex flex-col gap-2">
            {incoming.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm">
                <span className="mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                  <Avatar username={otherUsername(r, user.id)} />
                  {otherUsername(r, user.id) || "onbekend"} <Rating value={otherRating(r, user.id)} /> wil vrienden worden
                </span>
                <div className="flex items-center gap-2">
                  <button className="btn btn-success" onClick={() => acceptRequest(r.id)}><Check size={15} /> Accepteren</button>
                  <button className="btn btn-danger" onClick={() => removeRequest(r.id)}><X size={15} /> Afwijzen</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="panel">
          <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            Verzonden verzoeken
          </h2>
          <ul className="flex flex-col gap-2">
            {outgoing.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm">
                <span className="mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                  <Avatar username={otherUsername(r, user.id)} />
                  Verzoek naar {otherUsername(r, user.id) || "onbekend"} <Rating value={otherRating(r, user.id)} />
                </span>
                <button className="btn btn-danger" onClick={() => removeRequest(r.id)}><Ban size={15} /> Annuleren</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2 className="text-sm uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
          Vrienden
        </h2>
        {friends.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Nog geen vrienden — zoek hierboven iemand op.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {friends.map((r) => (
            <li key={r.id} className="flex items-center justify-between text-sm">
              <span className="mono flex items-center gap-2" style={{ color: "var(--muted)" }}>
                <Avatar username={otherUsername(r, user.id)} /> {otherUsername(r, user.id) || "onbekend"} <Rating value={otherRating(r, user.id)} />
              </span>
              <button className="btn btn-danger" onClick={() => removeRequest(r.id)}><UserMinus size={15} /> Verwijderen</button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
