import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDataset } from "./lore";
import { createWindowsCurlFetch, MediaWikiProvider } from "./reference/providers";
import { buildCoverageReport, syncReferenceCorpus, validateReferenceCorpus, writeCoverageOutputs } from "./reference/pipeline";
import type { ReferenceCorpus, ReferenceWork, WorksManifest } from "./reference/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = <T>(relative: string): T => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")) as T;

function selectWorks(manifest: WorksManifest, scope?: string): ReferenceWork[] {
  const enabled = manifest.works.filter((work) => work.coverageEnabled && work.discovery);
  if (!scope || scope === "all") return enabled;
  const normalized = scope.toLocaleLowerCase("en-US");
  const selected = manifest.works.find((work) => work.slug === normalized || work.id === scope || work.title.toLocaleLowerCase("en-US") === normalized);
  if (!selected) throw new Error(`Unknown work scope '${scope}'. Available scopes: ${enabled.map((work) => work.slug).join(", ")}`);
  if (selected.discovery) return [selected];
  if (selected.parentWorkId) {
    const parent = manifest.works.find((work) => work.id === selected.parentWorkId && work.discovery);
    if (parent) return [parent];
  }
  throw new Error(`Work '${selected.title}' has no configured discovery category.`);
}

function loadCorpus(): ReferenceCorpus {
  const filename = path.join(root, "reference/manifests/reference-corpus.json");
  if (!fs.existsSync(filename)) throw new Error("No reference corpus exists. Run 'pnpm lore:reference:sync' first.");
  return JSON.parse(fs.readFileSync(filename, "utf8")) as ReferenceCorpus;
}

async function main() {
  const command = process.argv[2] ?? "sync";
  const scope = process.argv.slice(3).find((value) => !value.startsWith("--"));
  const offline = process.argv.includes("--offline");
  const refresh = process.argv.includes("--refresh");
  const rebuildAll = process.argv.includes("--rebuild");
  const worksManifest = readJson<WorksManifest>("reference/works.json");
  const dataset = loadDataset();
  let corpus: ReferenceCorpus;
  if (command === "sync") {
    const selectedWorks = selectWorks(worksManifest, scope);
    const provider = new MediaWikiProvider({
      apiUrl: "https://fallout.fandom.com/api.php",
      cacheDir: path.join(root, "reference/cache/nukapedia"),
      userAgent: "FalloutLoreArchive/0.1 (https://github.com/c41p/Fallout-Lore-Archive; research acquisition)",
      offline,
      forceRefresh: refresh,
      fetchImpl: process.platform === "win32" ? createWindowsCurlFetch() : fetch
    });
    corpus = await syncReferenceCorpus({ root, provider, worksManifest, dataset, selectedWorks, explicitMappings: readJson<Record<string, string>>("reference/mappings.json"), rebuildAll });
    console.log(`Reference sync: ${corpus.sync.discoveredPages} discovered, ${corpus.sync.changedPages} changed/new, ${corpus.sync.unchangedPages} unchanged, ${corpus.sync.failures.length} failures.`);
    for (const failure of corpus.sync.failures) console.warn(`WARNING ${failure.scope}: ${failure.message}`);
  } else if (command === "coverage" || command === "validate") {
    corpus = loadCorpus();
  } else {
    throw new Error(`Unknown command '${command}'. Use sync or coverage.`);
  }
  const validationErrors = validateReferenceCorpus(corpus, worksManifest.works, dataset);
  if (validationErrors.length) throw new Error(`Reference validation failed:\n${validationErrors.slice(0, 100).join("\n")}`);
  if (command === "validate") {
    console.log(`Validated ${corpus.candidates.length} reference candidates with page-level attribution and work/entity integrity.`);
    return;
  }
  const report = buildCoverageReport(corpus, worksManifest.works, dataset, corpus.generatedAt);
  writeCoverageOutputs(root, report, corpus);
  const selectedReport = scope && scope !== "all" ? report.works.find((work) => work.slug === scope || work.workId === scope) : undefined;
  if (selectedReport) console.log(JSON.stringify(selectedReport, null, 2));
  else console.log(`Coverage: ${report.totals.referenceSubjects} subject-work associations, ${report.totals.matchedArchiveEntities} matched, ${report.totals.tier1Gaps} Tier 1 gaps, ${report.totals.weightedLoreCoverage}% weighted.`);
  if (corpus.sync.failures.length) process.exitCode = 2;
}

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
