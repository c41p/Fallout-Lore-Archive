import { Archive, Clock3, Compass, Database, Gamepad2, Home, Map, Menu, Route, Search, X } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/games", label: "Games", icon: Gamepad2 },
  { to: "/paths", label: "Lore Paths", icon: Route },
  { to: "/browse", label: "Search & browse", icon: Search },
  { to: "/timeline", label: "Timeline", icon: Clock3 },
  { to: "/map", label: "Map", icon: Map }
];

export function Layout() {
  const [open, setOpen] = useState(false);
  return <div className="app-shell">
    <button className="mobile-menu" onClick={() => setOpen(!open)} aria-label={open ? "Close navigation" : "Open navigation"}>{open ? <X /> : <Menu />}</button>
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand"><span className="brand-mark"><Archive aria-hidden /></span><div><strong>Fallout</strong><span>Lore Archive</span></div></div>
      <p className="archive-label"><Database size={14} /> Local archive · v0.1</p>
      <nav aria-label="Primary navigation">{links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}><Icon size={18} aria-hidden />{label}</NavLink>)}</nav>
      <div className="sidebar-note"><Compass size={17} /><p>Follow people, places, events and evidence through one connected record.</p></div>
      <footer>Offline prototype<br />No account · No telemetry</footer>
    </aside>
    <main className="content"><Outlet /></main>
  </div>;
}
