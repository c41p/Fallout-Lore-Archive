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
});
