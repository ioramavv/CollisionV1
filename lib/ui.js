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
