"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const LINKS = [
  { href: "/lobby", label: "Lobby" },
  { href: "/friends", label: "Vrienden" },
];

export default function AppLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("username").eq("id", user.id).single();
      if (active) setProfile(data);
    })();
    return () => { active = false; };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-brand">
          Colli<span style={{ color: "var(--gold)" }}>sion</span>
        </div>
        <ul className="sidebar-nav">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`sidebar-link${pathname.startsWith(link.href) ? " active" : ""}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          {profile && <span className="mono sidebar-username">{profile.username}</span>}
          <button className="btn" onClick={signOut}>Uitloggen</button>
        </div>
      </nav>
      <main className="app-content">{children}</main>
    </div>
  );
}
