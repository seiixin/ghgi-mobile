import * as SQLite from "expo-sqlite";

let dbPromise = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("ghgi_kv.db");
    const db = await dbPromise;
    await db.execAsync("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY NOT NULL, v TEXT NOT NULL);");
  }
  return dbPromise;
}

function kMapping(formTypeId, year) {
  return `mapping_json:${formTypeId}:${year}`;
}

function kFormTypes() {
  return "form_types:active";
}

/**
 * Cache form types list (array).
 */
export async function cacheFormTypes(list) {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?);", [
    kFormTypes(),
    JSON.stringify(list ?? []),
  ]);
}

export async function getCachedFormTypes() {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT v FROM kv WHERE k = ? LIMIT 1;", [kFormTypes()]);
  if (!row?.v) return null;
  try {
    const parsed = JSON.parse(row.v);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Cache mapping_json object for a specific (formTypeId, year).
 */
export async function cacheMappingJson({ formTypeId, year, mappingJson }) {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?);", [
    kMapping(formTypeId, year),
    JSON.stringify(mappingJson ?? {}),
  ]);
}

export async function getCachedMappingJson({ formTypeId, year }) {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT v FROM kv WHERE k = ? LIMIT 1;", [kMapping(formTypeId, year)]);
  if (!row?.v) return null;
  try {
    return JSON.parse(row.v);
  } catch {
    return null;
  }
}

export async function clearCachedMapping({ formTypeId, year }) {
  const db = await getDb();
  await db.runAsync("DELETE FROM kv WHERE k = ?;", [kMapping(formTypeId, year)]);
}
