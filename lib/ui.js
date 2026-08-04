// Kleine, herbruikbare UI-bouwstenen: avatars en statusbadges.

const AVATAR_PALETTE = ["#c17f3e", "#7a8b69", "#5b7c99", "#a85c7c", "#8a6bab", "#c2673e", "#4a8a7c"];

function colorForName(name) {
  if (!name) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function Avatar({ username, size = 26 }) {
  const initial = username ? username[0].toUpperCase() : "?";
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: colorForName(username), fontSize: size * 0.45 }}
    >
      {initial}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function DirBtn({ icon: Icon, onClick, disabled }) {
  return <button className="btn btn-icon" onClick={onClick} disabled={disabled}><Icon size={16} /></button>;
}

// Zelfde vorm als een hulpstuk op het bord (rood vierkantje, 45° gedraaid)
// i.p.v. een generiek hamer-icoon — zo is meteen duidelijk wat de knop doet.
export function ToolIcon({ size = 14 }) {
  return (
    <span
      style={{
        display: "inline-block", width: size, height: size, flexShrink: 0,
        borderRadius: 3, transform: "rotate(45deg)", background: "currentColor",
      }}
    />
  );
}

// Rating-getal achter een gebruikersnaam, net als bij chess.com. Geeft niks
// terug als er (nog) geen rating bekend is — bv. de "Computer"-tegenstander
// heeft geen profielrij en dus geen rating.
export function Rating({ value }) {
  if (value == null) return null;
  return (
    <span className="mono" style={{ color: "var(--muted)", fontSize: "0.85em" }}>
      ({value})
    </span>
  );
}

// Wordmark "COLLISION" — bold geometrisch lettertype, met een vierkant
// "O"-symbool (kader + rood accent) op de plek van de tweede letter.
// Alle maten zijn em-gebaseerd op de meegegeven `size`, zodat de vorm
// exact meeschaalt.
export function Logo({ size = 32 }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: 'var(--font-poppins), "Helvetica Neue", Arial, sans-serif',
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: "var(--text)" }}>C</span>
      <span
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "0.733em",
          height: "0.733em",
          margin: "0 0.02em",
          borderRadius: "0.2em",
          background: "var(--text)",
          flexShrink: 0,
        }}
      >
        <span style={{ position: "absolute", inset: "0.117em", borderRadius: "0.125em", background: "var(--bg)" }} />
        <span style={{ position: "absolute", width: "0.333em", height: "0.333em", borderRadius: "0.083em", background: "var(--accent)" }} />
      </span>
      <span style={{ color: "var(--text)" }}>LLI</span>
      <span style={{ color: "var(--accent)" }}>SION</span>
    </span>
  );
}
