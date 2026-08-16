import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDatabase, loadDataset } from "../scripts/lore";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fla-test-"));
const database = path.join(tempDir, "test.db");
const sqlite = process.env.FLA_SQLITE3 ?? "sqlite3";
const query = (sql: string) => spawnSync(sqlite, ["-json", database, sql], { encoding: "utf8", windowsHide: true });

describe("SQLite compiler", () => {
  beforeAll(() => buildDatabase(loadDataset(), database));
  afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  it("builds a database with foreign-key integrity", () => { const result = query("PRAGMA foreign_key_check;"); expect(result.status).toBe(0); expect(result.stdout.trim()).toBe(""); });
  it("indexes canonical names and aliases in FTS5", () => {
    const maxson = query("SELECT id FROM entity_fts WHERE entity_fts MATCH 'Maxson*' ORDER BY rank;");
    const fev = query("SELECT id FROM entity_fts WHERE entity_fts MATCH 'FEV*' ORDER BY rank;");
    expect(maxson.stdout).toContain("ent.roger_maxson"); expect(fev.stdout).toContain("ent.fev");
  });
  it("indexes long-form article prose at a lower-weight searchable field", () => {
    const articleMatch = query("SELECT id FROM entity_fts WHERE entity_fts MATCH 'displaced community' ORDER BY rank;");
    expect(articleMatch.status).toBe(0); expect(articleMatch.stdout).toContain("ent.roger_maxson");
    const stored = query("SELECT article_json FROM entities WHERE id='ent.roger_maxson';");
    expect(stored.stdout).toContain("Discovery of the FEV experiments");
  });
  it("retains human-readable source context and multiple evidence links", () => {
    const source = query("SELECT data_json FROM source_items WHERE id='src.fallout.maxson_diary';");
    expect(source.stdout).toContain("First-person diary recovered in Fallout");
    const evidence = query("SELECT count(*) count FROM evidence_links WHERE target_id='asrt.roger.stationed_mariposa';");
    expect(JSON.parse(evidence.stdout)[0].count).toBe(2);
  });
  it("stores bidirectional traversal inputs without duplicate inverse assertions", () => {
    const result = query("SELECT subject_id,object_entity_id FROM assertions WHERE subject_id='ent.roger_maxson' AND object_entity_id='ent.brotherhood';");
    expect(JSON.parse(result.stdout)).toHaveLength(2);
    const inverse = query("SELECT count(*) count FROM assertions WHERE subject_id='ent.brotherhood' AND object_entity_id='ent.roger_maxson';");
    expect(JSON.parse(inverse.stdout)[0].count).toBe(0);
  });
  it("preserves temporal state and timeline precision", () => {
    const state = query("SELECT valid_time_json FROM assertions WHERE id='asrt.roger.us_army';");
    expect(state.stdout).toContain("until October 2077");
    const timeline = query("SELECT object_json FROM assertions WHERE id='asrt.time.great_war';");
    expect(timeline.stdout).toContain("23 October 2077");
  });
  it("keeps spatial precision and dispute records queryable", () => {
    expect(query("SELECT geometry_kind FROM spatial_representations WHERE place_id='ent.hoover_dam';").stdout).toContain("exact_point");
    expect(query("SELECT geometry_kind FROM spatial_representations WHERE place_id='ent.lost_hills';").stdout).toContain("approximate_point");
    expect(query("SELECT id FROM disputes WHERE id='dispute.jet_origin';").stdout).toContain("dispute.jet_origin");
  });
  it("compiles the Fallout 1 work index and rich corpus", () => {
    const appearances = query("SELECT count(DISTINCT entity_id) count FROM appearances WHERE work_id='work.fallout';");
    expect(JSON.parse(appearances.stdout)[0].count).toBeGreaterThan(100);
    const master = query("SELECT id FROM entity_fts WHERE entity_fts MATCH '\"Richard Grey\"';");
    expect(master.stdout).toContain("ent.master");
    const sources = query("SELECT count(*) count FROM source_items WHERE work_id='work.fallout';");
    expect(JSON.parse(sources.stdout)[0].count).toBeGreaterThan(40);
  });
  it("preserves conditional outcomes as graph assertions", () => {
    const branches = query("SELECT count(*) count FROM outcome_assertions WHERE group_id='outcome.f1.shady';");
    expect(JSON.parse(branches.stdout)[0].count).toBe(3);
    const condition = query("SELECT condition_set_id FROM assertions WHERE id='asrt.f1.outcome.shady_ncr';");
    expect(condition.stdout).toContain("cond.f1.shady_ncr");
  });
  it("adds a dense Fallout 1 chronology without false day precision", () => {
    const dated = query("SELECT count(*) count FROM assertions a JOIN appearances ap ON ap.entity_id=a.subject_id WHERE ap.work_id='work.fallout' AND a.sort_key IS NOT NULL;");
    expect(JSON.parse(dated.stdout)[0].count).toBeGreaterThan(15);
    const variable = query("SELECT object_json FROM assertions WHERE id='asrt.f1.time.mariposa_vats';");
    expect(variable.stdout).toContain("order and date vary");
  });
});
