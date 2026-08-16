import { HashRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { BrowsePage } from "./pages/BrowsePage";
import { EntityPage } from "./pages/EntityPage";
import { HomePage } from "./pages/HomePage";
import { MapPage } from "./pages/MapPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { TimelinePage } from "./pages/TimelinePage";

export function App() { return <HashRouter><Routes><Route element={<Layout />}><Route index element={<HomePage />} /><Route path="browse" element={<BrowsePage />} /><Route path="entity/:id" element={<EntityPage />} /><Route path="timeline" element={<TimelinePage />} /><Route path="map" element={<MapPage />} /><Route path="*" element={<NotFoundPage />} /></Route></Routes></HashRouter>; }
