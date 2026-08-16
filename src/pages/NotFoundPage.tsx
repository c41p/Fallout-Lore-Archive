import { Link } from "react-router-dom";
export function NotFoundPage() { return <div className="page empty-state"><h1>Page not found</h1><p>This route is not part of the local archive.</p><Link to="/">Return home</Link></div>; }
