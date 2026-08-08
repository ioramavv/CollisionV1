"use client";
// Publieke landingspagina voor een vriend-uitnodigingslink
// (/invite/<gebruikersnaam>) — bewust BUITEN de (app)-groep, net als
// /login en /register, zodat een nog-niet-ingelogde vriend die de link
// opent niet meteen de volledige appschil (zijbalk e.d.) te zien krijgt.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { UserPlus, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Avatar, Rating, Logo, BoardLoader } from "@/lib/ui";

export default function InvitePage() {
  const { username } = useParams();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [inviter, setInviter] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [relationship, setRelationship] = useState("none"); // "self" | "friends" | "pending-sent" | "none"
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!active) return;
      setUser(authUser);

      const { data: inviterProfile } = await supabase
        .from("profiles")
        .select("id, username, rating")
        .eq("username", username)
        .maybeSingle();
      if (!active) return;
      if (!inviterProfile) { setNotFound(true); setLoading(false); return; }
      setInviter(inviterProfile);

      if (authUser) {
        if (authUser.id === inviterProfile.id) {
          setRelationship("self");
        } else {
          const { data: existing } = await supabase
            .from("friendships")
            .select("id, requester_id, status")
            .or(`and(requester_id.eq.${authUser.id},addressee_id.eq.${inviterProfile.id}),and(requester_id.eq.${inviterProfile.id},addressee_id.eq.${authUser.id})`)
            .maybeSingle();
          if (existing?.status === "accepted") setRelationship("friends");
          // Als jij het verzoek al verstuurd hebt, mag alleen de ontvanger
          // (de inviter) het accepteren — dat kan deze pagina niet voor je
          // doen (zie RLS: alleen addressee_id mag accepteren).
          else if (existing && existing.requester_id === authUser.id) setRelationship("pending-sent");
          else setRelationship("none");
        }
      }
      setLoading(false);
    })();

    return () => { active = false; };
  }, [username]);

  // Zelfde "upgrade een bestaand pending-verzoek, anders nieuw aanmaken"-
  // logica als sendRequest() op de vriendenpagina — alleen hier meteen als
  // "accepted" i.p.v. "pending": het openen én bevestigen van een persoonlijk
  // gedeelde link is zelf al het wederzijdse akkoord. Let op: alleen de
  // addressee_id van een bestaande rij mag 'm accepteren (zie UPDATE-policy
  // op friendships) — als jij zelf ooit al een verzoek naar de inviter
  // stuurde, sta jij als requester_id en kan alleen de inviter dat zelf nog
  // accepteren.
  async function acceptInvite() {
    if (!user || !inviter) return;
    setAccepting(true);
    setError(null);

    const { data: existing } = await supabase
      .from("friendships")
      .select("id, requester_id, status")
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${inviter.id}),and(requester_id.eq.${inviter.id},addressee_id.eq.${user.id})`)
      .maybeSingle();

    if (existing) {
      if (existing.status === "accepted") {
        setAccepting(false);
        setAccepted(true);
        return;
      }
      if (existing.requester_id !== inviter.id) {
        // Jij was de requester — dit kan alleen de inviter zelf accepteren.
        setAccepting(false);
        setRelationship("pending-sent");
        return;
      }
      await supabase.from("friendships").update({ status: "accepted" }).eq("id", existing.id);
    } else {
      const { error } = await supabase
        .from("friendships")
        .insert({ requester_id: user.id, addressee_id: inviter.id, status: "accepted" });
      if (error) {
        setError("Vrienden worden mislukt: " + error.message);
        setAccepting(false);
        return;
      }
    }

    setAccepting(false);
    setAccepted(true);
  }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><BoardLoader /></main>;

  if (notFound) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="panel w-full max-w-sm flex flex-col items-center gap-3 text-center">
          <Logo size={26} />
          <p className="text-sm" style={{ color: "var(--muted)" }}>Deze uitnodigingslink is niet geldig.</p>
          <a className="btn btn-solid" href="/lobby">Naar Collision</a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="panel w-full max-w-sm flex flex-col items-center gap-4 text-center">
        <Logo size={26} />
        <Avatar username={inviter.username} size={48} />
        <div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>Je bent uitgenodigd door</p>
          <p className="text-lg font-bold flex items-center justify-center gap-2">
            {inviter.username} <Rating value={inviter.rating} />
          </p>
        </div>

        {!user ? (
          <>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Log in of registreer, en open deze link daarna nog een keer om vrienden te worden.
            </p>
            <div className="flex items-center gap-2">
              <a className="btn" href="/login">Inloggen</a>
              <a className="btn btn-solid" href="/register">Registreren</a>
            </div>
          </>
        ) : relationship === "self" ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Dit is je eigen uitnodigingslink.</p>
        ) : relationship === "pending-sent" ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Je hebt {inviter.username} al een vriendverzoek gestuurd — die moet het nog accepteren.
          </p>
        ) : relationship === "friends" || accepted ? (
          <>
            <p className="text-sm flex items-center gap-2" style={{ color: "#9db98a" }}>
              <Check size={16} /> Jullie zijn vrienden!
            </p>
            <a className="btn btn-solid" href="/friends">Naar je vrienden</a>
          </>
        ) : (
          <>
            {error && <p className="text-xs" style={{ color: "#e07a5f" }}>{error}</p>}
            <button className="btn btn-solid" onClick={acceptInvite} disabled={accepting}>
              <UserPlus size={15} /> {accepting ? "Bezig..." : "Word vrienden"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
