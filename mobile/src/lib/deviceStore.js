import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";

let dbPromise = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("ghgi_kv.db");
    const db = await dbPromise;
    await db.execAsync("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY NOT NULL, v TEXT NOT NULL);");
  }
  return dbPromise;
}

export async function getOrCreateDeviceId() {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT v FROM kv WHERE k = 'device_id' LIMIT 1;");
  if (row?.v) return row.v;

  const uuid = Crypto.randomUUID();
  await db.runAsync("INSERT INTO kv (k, v) VALUES ('device_id', ?);", [uuid]);
  return uuid;
}
