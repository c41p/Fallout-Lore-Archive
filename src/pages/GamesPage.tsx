import { Gamepad2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listGames } from "../lib/api";
import type { SourceWork } from "../types";

export function GamesPage() {
  const [games, setGames] = useState<SourceWork[]>([]); const [error, setError] = useState("");
  useEffect(() => { listGames().then(setGames).catch((e: Error) => setError(e.message)); }, []);
  return <div className="page"><header className="page-header"><span className="kicker">SOURCE WORKS</span><h1>Games</h1><p>Explore the archive by released work. A game page gathers its people, factions, places, events and source locators without separating them from the shared knowledge graph.</p></header>
    {error && <div className="error-panel">{error}</div>}
    <div className="game-grid">{games.map((game) => <Link key={game.id} to={`/games/${game.slug}`}><Gamepad2 /><span>{game.releaseDate?.slice(0, 4) ?? "Undated"}</span><h2>{game.title}</h2><p>{game.description ?? "Browse records and source material associated with this work."}</p><strong>Open game archive →</strong></Link>)}</div>
  </div>;
}
