import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db/pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function splitSqlStatements(sql) {
  // simple splitter for our migration file (no procedures)
  return sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.endsWith(";") ? s : s + ";");
}

async function tableExists(name) {
  const [rows] = await pool.execute(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
    [name]
  );
  return rows.length > 0;
}

async function fkExists(table, fkName) {
  const [rows] = await pool.execute(
    "SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_name = ? LIMIT 1",
    [table, fkName]
  );
  return rows.length > 0;
}

async function addFkIfPossible() {
  if (!(await tableExists("users"))) {
    console.log("  ! skipped foreign keys: users table not found in this database");
    return;
  }

  const fks = [
    { table: "devices", name: "fk_devices_user", sql: "ALTER TABLE devices ADD CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE" },
    { table: "refresh_tokens", name: "fk_refresh_user", sql: "ALTER TABLE refresh_tokens ADD CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE" },
  ];

  for (const fk of fks) {
    if (!(await tableExists(fk.table))) continue;
    if (await fkExists(fk.table, fk.name)) continue;
    try {
      await pool.execute(fk.sql);
      console.log(`  + added FK ${fk.name}`);
    } catch (e) {
      console.log(`  ! could not add FK ${fk.name}: ${e.code || e.message}`);
    }
  }
}

async function main() {
  const sqlDir = path.resolve(__dirname, "../../sql");
  const files = fs.readdirSync(sqlDir).filter(f => /^\d+_.*\.sql$/.test(f)).sort();

  console.log(`Running ${files.length} migration file(s)...`);
  for (const file of files) {
    const p = path.join(sqlDir, file);
    const raw = fs.readFileSync(p, "utf8");
    const stmts = splitSqlStatements(raw);
    console.log(`- ${file} (${stmts.length} statement(s))`);
    for (const stmt of stmts) {
      await pool.query(stmt);
    }
  }

  await addFkIfPossible();
  console.log("Migrations completed.");
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
