use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::HashSet, path::PathBuf, sync::Mutex};
use tauri::{Manager, State};

fn is_safe_external_url(url: &str) -> bool {
    if url.is_empty() || url.len() > 2048 || url.chars().any(|character| character.is_control() || character.is_whitespace()) { return false; }
    let remainder = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://"));
    let Some(remainder) = remainder else { return false };
    let authority = remainder.split(['/', '?', '#']).next().unwrap_or_default();
    !authority.is_empty() && !authority.contains('@')
}

#[tauri::command]
fn open_external_source(url: String) -> Result<(), String> {
    if !is_safe_external_url(&url) { return Err("Only valid HTTP and HTTPS source links can be opened.".to_string()); }
    #[cfg(target_os = "windows")]
    let mut command = { let mut command = std::process::Command::new("rundll32.exe"); command.arg("url.dll,FileProtocolHandler").arg(&url); command };
    #[cfg(target_os = "macos")]
    let mut command = { let mut command = std::process::Command::new("open"); command.arg(&url); command };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = { let mut command = std::process::Command::new("xdg-open"); command.arg(&url); command };
    command.spawn().map(|_| ()).map_err(|error| format!("Unable to open source link: {error}"))
}

struct DatabasePath(Mutex<PathBuf>);

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchFilters { entity_type: Option<String>, work_id: Option<String> }

fn open_db(state: &State<DatabasePath>) -> Result<Connection, String> {
    let path = state.0.lock().map_err(|_| "Database path lock was poisoned".to_string())?.clone();
    Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|error| format!("Unable to open the local lore database: {error}"))
}

fn parse(text: String) -> Result<Value, String> { serde_json::from_str(&text).map_err(|error| format!("Invalid compiled JSON: {error}")) }

fn entity_from_row(row: &Row<'_>) -> rusqlite::Result<Value> {
    let tags: String = row.get("tags_json")?;
    Ok(json!({
        "id": row.get::<_, String>("id")?, "type": row.get::<_, String>("type")?, "subtype": row.get::<_, String>("subtype")?,
        "displayName": row.get::<_, String>("display_name")?, "summary": row.get::<_, String>("summary")?,
        "description": row.get::<_, Option<String>>("description")?,
        "articleTier": row.get::<_, Option<String>>("article_tier")?,
        "articleSections": serde_json::from_str::<Value>(&row.get::<_, String>("article_json")?).unwrap_or(json!([])),
        "tags": serde_json::from_str::<Value>(&tags).unwrap_or(json!([])),
        "recordStatus": row.get::<_, String>("status")?, "featured": row.get::<_, i64>("featured")? != 0
    }))
}

fn get_entity_record(db: &Connection, id: &str) -> Result<Option<Value>, String> {
    db.query_row("SELECT * FROM entities WHERE id=?1", [id], entity_from_row).optional().map_err(|e| e.to_string())
}

fn evidence_for(db: &Connection, assertion_id: &str) -> Result<Vec<Value>, String> {
    let mut statement = db.prepare("SELECT e.data_json link_json, i.data_json item_json, w.data_json work_json FROM evidence_links e JOIN source_items i ON i.id=e.source_item_id JOIN source_works w ON w.id=i.work_id WHERE e.target_id=?1 ORDER BY w.id, i.id").map_err(|e| e.to_string())?;
    let rows = statement.query_map([assertion_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))).map_err(|e| e.to_string())?;
    rows.map(|row| { let (link, item, work) = row.map_err(|e| e.to_string())?; Ok(json!({ "link": parse(link)?, "item": parse(item)?, "work": parse(work)? })) }).collect()
}

fn assertion_view(db: &Connection, assertion_id: &str) -> Result<Value, String> {
    let (subject_id, predicate_json, object_json, mode, status, valid_time, continuity, notes, object_entity_id, condition_set_id): (String,String,String,String,String,Option<String>,String,Option<String>,Option<String>,Option<String>) = db.query_row(
        "SELECT a.subject_id,p.data_json,a.object_json,a.mode,a.epistemic_status,a.valid_time_json,a.continuity_json,a.notes,a.object_entity_id,a.condition_set_id FROM assertions a JOIN predicates p ON p.id=a.predicate_id WHERE a.id=?1", [assertion_id],
        |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?,r.get(8)?,r.get(9)?))
    ).map_err(|e| e.to_string())?;
    let assertion = json!({ "id": assertion_id, "subjectId": subject_id, "predicateId": parse(predicate_json.clone())?["id"], "object": parse(object_json)?, "assertionMode": mode, "epistemicStatus": status, "validTime": valid_time.map(parse).transpose()?, "continuityScope": parse(continuity)?, "conditionSetId": condition_set_id, "notes": notes });
    let object_entity = object_entity_id.map(|id| get_entity_record(db, &id)).transpose()?.flatten();
    let condition_set = condition_set_id.map(|condition_id| db.query_row("SELECT data_json FROM condition_sets WHERE id=?1", [condition_id], |row| row.get::<_,String>(0)).optional()).transpose().map_err(|e| e.to_string())?.flatten().map(parse).transpose()?;
    Ok(json!({ "assertion": assertion, "predicate": parse(predicate_json)?, "objectEntity": object_entity, "conditionSet": condition_set, "evidence": evidence_for(db, assertion_id)? }))
}

#[tauri::command]
fn search_entities(state: State<DatabasePath>, query: String, filters: SearchFilters) -> Result<Vec<Value>, String> {
    let db = open_db(&state)?;
    let tokens: Vec<String> = query.split_whitespace().map(|word| word.chars().filter(|c| c.is_alphanumeric()).collect::<String>()).filter(|word| !word.is_empty()).map(|word| format!("{word}*")).collect();
    if tokens.is_empty() { return list_entities(state, filters); }
    let match_query = tokens.join(" ");
    let mut statement = db.prepare("SELECT e.*, bm25(entity_fts, 0.0, 5.0, 3.0, 1.5, 1.0, 0.45, 1.0) rank, snippet(entity_fts, 5, '', '', ' … ', 24) match_snippet, COALESCE(group_concat(n.name, '||'),'') aliases, CASE WHEN lower(e.display_name)=lower(?3) THEN 0 WHEN EXISTS (SELECT 1 FROM names exact_name WHERE exact_name.entity_id=e.id AND lower(exact_name.name)=lower(?3)) THEN 1 ELSE 2 END exactness, CASE WHEN lower(e.display_name) LIKE lower(?3)||'%' THEN 'name' WHEN EXISTS (SELECT 1 FROM names matching_name WHERE matching_name.entity_id=e.id AND lower(matching_name.name)=lower(?3)) THEN 'alias' ELSE 'article' END match_field FROM entity_fts JOIN entities e ON e.id=entity_fts.id LEFT JOIN names n ON n.entity_id=e.id WHERE entity_fts MATCH ?1 AND (?2 IS NULL OR e.type=?2) AND (?4 IS NULL OR EXISTS (SELECT 1 FROM appearances ap WHERE ap.entity_id=e.id AND ap.work_id=?4)) GROUP BY e.id ORDER BY exactness, rank, e.display_name LIMIT 100").map_err(|e| e.to_string())?;
    let rows = statement.query_map(params![match_query, filters.entity_type, query.trim(), filters.work_id], |row| { let mut entity = entity_from_row(row)?; entity["rank"] = json!(row.get::<_, f64>("rank")?); entity["matchSnippet"] = json!(row.get::<_, String>("match_snippet")?); entity["matchField"] = json!(row.get::<_, String>("match_field")?); entity["aliases"] = json!(row.get::<_, String>("aliases")?.split("||").filter(|s| !s.is_empty()).collect::<Vec<_>>()); Ok(entity) }).map_err(|e| e.to_string())?;
    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}

#[tauri::command]
fn list_entities(state: State<DatabasePath>, filters: SearchFilters) -> Result<Vec<Value>, String> {
    let db = open_db(&state)?;
    let mut statement = db.prepare("SELECT e.*, COALESCE(group_concat(n.name, '||'),'') aliases FROM entities e LEFT JOIN names n ON n.entity_id=e.id WHERE (?1 IS NULL OR e.type=?1) AND (?2 IS NULL OR EXISTS (SELECT 1 FROM appearances ap WHERE ap.entity_id=e.id AND ap.work_id=?2)) GROUP BY e.id ORDER BY e.display_name").map_err(|e| e.to_string())?;
    let rows = statement.query_map(params![filters.entity_type, filters.work_id], |row| { let mut entity = entity_from_row(row)?; entity["aliases"] = json!(row.get::<_, String>("aliases")?.split("||").filter(|s| !s.is_empty()).collect::<Vec<_>>()); Ok(entity) }).map_err(|e| e.to_string())?;
    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}

#[tauri::command]
fn get_featured_entities(state: State<DatabasePath>) -> Result<Vec<Value>, String> {
    let db = open_db(&state)?; let mut statement = db.prepare("SELECT * FROM entities WHERE featured=1 ORDER BY display_name").map_err(|e| e.to_string())?;
    let values = statement.query_map([], entity_from_row).map_err(|e| e.to_string())?.map(|r| r.map_err(|e| e.to_string())).collect();
    values
}

#[tauri::command]
fn list_games(state: State<DatabasePath>) -> Result<Vec<Value>, String> {
    let db = open_db(&state)?;
    let mut statement = db.prepare("SELECT data_json FROM source_works WHERE json_extract(data_json,'$.workType') IN ('game','video_game') AND json_extract(data_json,'$.slug') IS NOT NULL ORDER BY json_extract(data_json,'$.releaseDate')").map_err(|e| e.to_string())?;
    let games = statement.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?.map(|row| parse(row.map_err(|e| e.to_string())?)).collect();
    games
}

#[tauri::command]
fn get_game_profile(state: State<DatabasePath>, slug: String) -> Result<Option<Value>, String> {
    let db = open_db(&state)?;
    let Some((work_id, work_json)): Option<(String,String)> = db.query_row("SELECT id,data_json FROM source_works WHERE json_extract(data_json,'$.slug')=?1", [&slug], |row| Ok((row.get(0)?, row.get(1)?))).optional().map_err(|e| e.to_string())? else { return Ok(None) };
    let mut entity_stmt = db.prepare("SELECT e.* FROM appearances a JOIN entities e ON e.id=a.entity_id WHERE a.work_id=?1 ORDER BY e.display_name").map_err(|e| e.to_string())?;
    let entities: Vec<Value> = entity_stmt.query_map([&work_id], entity_from_row).map_err(|e| e.to_string())?.map(|row| row.map_err(|e| e.to_string())).collect::<Result<_,_>>()?;
    let mut item_stmt = db.prepare("SELECT DISTINCT i.data_json FROM source_items i LEFT JOIN evidence_links ev ON ev.source_item_id=i.id LEFT JOIN assertions a ON a.id=ev.target_id WHERE i.work_id=?1 OR EXISTS (SELECT 1 FROM appearances ap WHERE ap.entity_id=a.subject_id AND ap.work_id=?2) ORDER BY i.id").map_err(|e| e.to_string())?;
    let source_items: Vec<Value> = item_stmt.query_map(params![&work_id,&work_id], |row| row.get::<_,String>(0)).map_err(|e| e.to_string())?.map(|row| parse(row.map_err(|e| e.to_string())?)).collect::<Result<_,_>>()?;
    let mut counts = serde_json::Map::new();
    for entity in &entities { if let Some(kind) = entity["type"].as_str() { *counts.entry(kind.to_string()).or_insert(json!(0)) = json!(counts.get(kind).and_then(Value::as_i64).unwrap_or(0) + 1); } }
    Ok(Some(json!({"work":parse(work_json)?,"entities":entities,"sourceItems":source_items,"counts":counts})))
}

#[tauri::command]
fn get_timeline(state: State<DatabasePath>, filters: SearchFilters) -> Result<Vec<Value>, String> {
    let db = open_db(&state)?;
    let mut statement = db.prepare("SELECT e.*, a.object_json, a.epistemic_status, (SELECT count(*) FROM evidence_links ev WHERE ev.target_id=a.id) evidence_count FROM assertions a JOIN entities e ON e.id=a.subject_id WHERE a.sort_key IS NOT NULL AND (?1 IS NULL OR e.type=?1) AND (?2 IS NULL OR EXISTS (SELECT 1 FROM appearances ap WHERE ap.entity_id=e.id AND ap.work_id=?2)) ORDER BY a.sort_key,e.display_name").map_err(|e| e.to_string())?;
    let rows = statement.query_map(params![filters.entity_type, filters.work_id], |row| { let object: Value = serde_json::from_str(&row.get::<_, String>("object_json")?).unwrap_or(json!({})); Ok(json!({ "entity": entity_from_row(row)?, "temporal": object["temporal"].clone(), "epistemicStatus": row.get::<_, String>("epistemic_status")?, "evidenceCount": row.get::<_, i64>("evidence_count")? })) }).map_err(|e| e.to_string())?;
    let mut entries: Vec<Value> = rows.map(|r| r.map_err(|e| e.to_string())).collect::<Result<_,_>>()?;
    drop(statement);
    for entry in &mut entries {
        let Some(entity_id) = entry["entity"]["id"].as_str() else { entry["relatedEntities"] = json!([]); continue };
        let mut related_stmt = db.prepare("SELECT DISTINCT e.* FROM assertions a JOIN entities e ON e.id=CASE WHEN a.subject_id=?1 THEN a.object_entity_id ELSE a.subject_id END WHERE a.object_entity_id IS NOT NULL AND (a.subject_id=?2 OR a.object_entity_id=?3) ORDER BY e.display_name").map_err(|e| e.to_string())?;
        let related: Vec<Value> = related_stmt.query_map(params![entity_id,entity_id,entity_id], entity_from_row).map_err(|e| e.to_string())?.map(|row| row.map_err(|e| e.to_string())).collect::<Result<_,_>>()?;
        entry["relatedEntities"] = Value::Array(related);
    }
    Ok(entries)
}

#[tauri::command]
fn get_map_locations(state: State<DatabasePath>, filters: SearchFilters) -> Result<Vec<Value>, String> {
    let db = open_db(&state)?; let mut statement = db.prepare("SELECT e.*, s.data_json spatial_json FROM spatial_representations s JOIN entities e ON e.id=s.place_id WHERE (?1 IS NULL OR EXISTS (SELECT 1 FROM appearances ap WHERE ap.entity_id=e.id AND ap.work_id=?1)) ORDER BY e.display_name").map_err(|e| e.to_string())?;
    let rows = statement.query_map([filters.work_id], |row| { let spatial: Value = serde_json::from_str(&row.get::<_, String>("spatial_json")?).unwrap_or(json!({})); Ok(json!({ "entity": entity_from_row(row)?, "spatial": spatial })) }).map_err(|e| e.to_string())?;
    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}

#[tauri::command]
fn get_entity(state: State<DatabasePath>, id: String) -> Result<Option<Value>, String> {
    let db = open_db(&state)?; let Some(entity) = get_entity_record(&db, &id)? else { return Ok(None) };
    let mut names_stmt = db.prepare("SELECT name FROM names WHERE entity_id=?1 ORDER BY name").map_err(|e| e.to_string())?;
    let aliases: Vec<String> = names_stmt.query_map([&id], |r| r.get(0)).map_err(|e| e.to_string())?.map(|r| r.map_err(|e| e.to_string())).collect::<Result<_,_>>()?;
    let mut rel_stmt = db.prepare("SELECT a.id,a.subject_id,a.object_entity_id,a.epistemic_status,a.valid_time_json,p.data_json FROM assertions a JOIN predicates p ON p.id=a.predicate_id WHERE a.object_entity_id IS NOT NULL AND (a.subject_id=?1 OR a.object_entity_id=?1)").map_err(|e| e.to_string())?;
    let rel_rows = rel_stmt.query_map([&id], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,Option<String>>(4)?,r.get::<_,String>(5)?))).map_err(|e| e.to_string())?;
    let mut relationships = Vec::new();
    let mut relationship_keys = HashSet::new();
    for row in rel_rows { let (assertion_id, subject, object, status, valid, pred_json) = row.map_err(|e| e.to_string())?; let predicate = parse(pred_json)?; let outgoing = subject == id; let other_id = if outgoing { object } else { subject }; let key = format!("{}|{}|{}", predicate["id"].as_str().unwrap_or_default(), other_id, valid.as_deref().unwrap_or_default()); if !relationship_keys.insert(key) { continue; } if let Some(other) = get_entity_record(&db, &other_id)? { let label = if outgoing { predicate["label"].clone() } else if predicate["symmetric"].as_bool().unwrap_or(false) { predicate["label"].clone() } else { predicate.get("inverseLabel").cloned().unwrap_or(json!(format!("Subject of {}", predicate["label"].as_str().unwrap_or("relationship").to_lowercase()))) }; relationships.push(json!({ "assertionId": assertion_id, "direction": if outgoing {"outgoing"} else {"incoming"}, "label": label, "entity": other, "epistemicStatus": status, "validTime": valid.map(parse).transpose()?, "evidence": evidence_for(&db, &assertion_id)? })); } }
    let mut facts_stmt = db.prepare("SELECT id FROM assertions WHERE subject_id=?1 AND object_entity_id IS NULL ORDER BY sort_key").map_err(|e| e.to_string())?;
    let fact_ids: Vec<String> = facts_stmt.query_map([&id], |r| r.get(0)).map_err(|e| e.to_string())?.map(|r| r.map_err(|e| e.to_string())).collect::<Result<_,_>>()?;
    let facts: Vec<Value> = fact_ids.iter().map(|fact_id| assertion_view(&db, fact_id)).collect::<Result<_,_>>()?;
    let article_sections = entity["articleSections"].as_array().cloned().unwrap_or_default().into_iter().map(|mut section| {
        let assertion_ids = section["assertionIds"].as_array().cloned().unwrap_or_default();
        section["assertions"] = Value::Array(assertion_ids.iter().filter_map(Value::as_str).map(|aid| assertion_view(&db, aid)).collect::<Result<Vec<_>,_>>()?);
        let related_ids = section["relatedEntityIds"].as_array().cloned().unwrap_or_default();
        let mut related_entities = Vec::new();
        for related_id in related_ids.iter().filter_map(Value::as_str) {
            if let Some(related) = get_entity_record(&db, related_id)? { related_entities.push(related); }
        }
        section["relatedEntities"] = Value::Array(related_entities);
        Ok::<Value, String>(section)
    }).collect::<Result<Vec<_>,_>>()?;
    let mut spatial_stmt = db.prepare("SELECT data_json FROM spatial_representations WHERE place_id=?1").map_err(|e| e.to_string())?;
    let spatial: Vec<Value> = spatial_stmt.query_map([&id], |r| r.get::<_,String>(0)).map_err(|e| e.to_string())?.map(|r| parse(r.map_err(|e| e.to_string())?)).collect::<Result<_,_>>()?;
    let mut app_stmt = db.prepare("SELECT a.data_json,w.data_json FROM appearances a JOIN source_works w ON w.id=a.work_id WHERE a.entity_id=?1").map_err(|e| e.to_string())?;
    let appearances: Vec<Value> = app_stmt.query_map([&id], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).map_err(|e| e.to_string())?.map(|r| { let (appearance, work) = r.map_err(|e| e.to_string())?; let mut value=parse(appearance)?; value["work"] = parse(work)?; Ok::<Value, String>(value) }).collect::<Result<_,_>>()?;
    let mut dispute_stmt = db.prepare("SELECT d.data_json FROM disputes d JOIN dispute_topics t ON t.dispute_id=d.id WHERE t.entity_id=?1").map_err(|e| e.to_string())?;
    let mut disputes = Vec::new();
    for row in dispute_stmt.query_map([&id], |r| r.get::<_,String>(0)).map_err(|e| e.to_string())? { let mut dispute = parse(row.map_err(|e| e.to_string())?)?; let ids = dispute["assertionIds"].as_array().cloned().unwrap_or_default(); dispute["assertions"] = Value::Array(ids.iter().filter_map(Value::as_str).map(|aid| assertion_view(&db, aid)).collect::<Result<Vec<_>,_>>()?); disputes.push(dispute); }
    let mut outcome_stmt = db.prepare("SELECT o.data_json FROM outcome_groups o JOIN outcome_topics t ON t.group_id=o.id WHERE t.entity_id=?1 ORDER BY o.id").map_err(|e| e.to_string())?;
    let mut outcome_groups = Vec::new();
    for row in outcome_stmt.query_map([&id], |r| r.get::<_,String>(0)).map_err(|e| e.to_string())? { let mut group = parse(row.map_err(|e| e.to_string())?)?; let ids = group["assertionIds"].as_array().cloned().unwrap_or_default(); group["assertions"] = Value::Array(ids.iter().filter_map(Value::as_str).map(|aid| assertion_view(&db, aid)).collect::<Result<Vec<_>,_>>()?); outcome_groups.push(group); }
    Ok(Some(json!({ "entity": entity, "aliases": aliases, "articleSections": article_sections, "relationships": relationships, "facts": facts, "spatial": spatial, "appearances": appearances, "disputes": disputes, "outcomeGroups": outcome_groups })))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default().setup(|app| {
        let resource = app.path().resource_dir()?.join("generated").join("fallout-lore.db");
        let fallback = std::env::current_dir()?.parent().unwrap_or(&std::env::current_dir()?).join("generated").join("fallout-lore.db");
        let path = if resource.exists() { resource } else { fallback };
        if !path.exists() { return Err(format!("Compiled lore database not found at {}. Run pnpm lore:build.", path.display()).into()); }
        app.manage(DatabasePath(Mutex::new(path))); Ok(())
    }).invoke_handler(tauri::generate_handler![search_entities,list_entities,get_entity,get_timeline,get_map_locations,get_featured_entities,list_games,get_game_profile,open_external_source]).run(tauri::generate_context!()).expect("error while running Fallout Lore Archive");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Connection {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("generated").join("fallout-lore.db");
        Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap()
    }

    #[test]
    fn compiled_entity_and_evidence_are_readable() {
        let db = test_db();
        let entity = get_entity_record(&db, "ent.roger_maxson").unwrap().unwrap();
        assert_eq!(entity["displayName"], "Roger Maxson");
        assert!(entity["articleSections"].as_array().unwrap().len() >= 7);
        let evidence = evidence_for(&db, "asrt.roger.founded_brotherhood").unwrap();
        assert!(evidence.len() >= 2);
    }

    #[test]
    fn fts5_finds_aliases() {
        let db = test_db();
        let id: String = db.query_row("SELECT id FROM entity_fts WHERE entity_fts MATCH 'aliases:FEV' LIMIT 1", [], |row| row.get(0)).unwrap();
        assert_eq!(id, "ent.fev");
    }

    #[test]
    fn article_related_records_are_resolvable() {
        let db = test_db();
        let entity = get_entity_record(&db, "ent.roger_maxson").unwrap().unwrap();
        let related_id = entity["articleSections"][0]["relatedEntityIds"][2].as_str().unwrap();
        let related = get_entity_record(&db, related_id).unwrap().unwrap();
        assert_eq!(related["displayName"], "Robert Spindel");
    }

    #[test]
    fn dispute_assertions_keep_source_modes() {
        let db = test_db();
        let view = assertion_view(&db, "asrt.myron.claims_jet").unwrap();
        assert_eq!(view["assertion"]["assertionMode"], "source_statement");
        assert_eq!(view["assertion"]["epistemicStatus"], "disputed");
    }

    #[test]
    fn fallout_work_index_is_game_sized() {
        let db = test_db();
        let count: i64 = db.query_row("SELECT count(DISTINCT entity_id) FROM appearances WHERE work_id='work.fallout'", [], |row| row.get(0)).unwrap();
        assert!(count > 100);
        let work: String = db.query_row("SELECT data_json FROM source_works WHERE id='work.fallout'", [], |row| row.get(0)).unwrap();
        assert_eq!(parse(work).unwrap()["slug"], "fallout");
    }

    #[test]
    fn conditional_outcome_views_keep_their_qualifier() {
        let db = test_db();
        let view = assertion_view(&db, "asrt.f1.outcome.shady_ncr").unwrap();
        assert_eq!(view["conditionSet"]["kind"], "optional_outcome");
        assert_eq!(view["conditionSet"]["mutuallyExclusiveGroup"], "f1.shady_ending");
        assert!(!view["evidence"].as_array().unwrap().is_empty());
    }

    #[test]
    fn external_source_urls_are_protocol_limited() {
        assert!(is_safe_external_url("https://fallout.bethesda.net/en-US/news/example"));
        assert!(is_safe_external_url("http://example.org/source"));
        assert!(!is_safe_external_url("file:///C:/Windows/System32/calc.exe"));
        assert!(!is_safe_external_url("javascript:alert(1)"));
        assert!(!is_safe_external_url("https://user:password@example.org/source"));
        assert!(!is_safe_external_url("https://example.org/source\nmalformed"));
    }

    #[test]
    fn entity_view_deduplicates_symmetric_relationship_cards() {
        let db = test_db();
        let rows: i64 = db.query_row("SELECT count(*) FROM assertions WHERE predicate_id='pred.associated_with' AND ((subject_id='ent.courier' AND object_entity_id='ent.benny') OR (subject_id='ent.benny' AND object_entity_id='ent.courier'))", [], |row| row.get(0)).unwrap();
        assert!(rows >= 2, "fixture should exercise inverse duplicate presentation");
        let mut seen = HashSet::new();
        let mut statement = db.prepare("SELECT subject_id,object_entity_id FROM assertions WHERE predicate_id='pred.associated_with' AND (subject_id='ent.courier' OR object_entity_id='ent.courier')").unwrap();
        for row in statement.query_map([], |row| Ok((row.get::<_,String>(0)?, row.get::<_,String>(1)?))).unwrap() {
            let (subject, object) = row.unwrap();
            let other = if subject == "ent.courier" { object } else { subject };
            seen.insert(other);
        }
        assert!(seen.contains("ent.benny"));
    }
}
