import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";

async function upsertUser({ name, email, password, role }) {
  const hash = await bcrypt.hash(password, 12);
  // Laravel users table expects `password`
  await pool.execute(
    `INSERT INTO users (name, email, password, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       name=VALUES(name),
       password=VALUES(password),
       role=VALUES(role),
       updated_at=NOW()`,
    [name, email, hash, role]
  );
}

async function main() {
  console.log("Seeding users...");
  await upsertUser({ name: "Admin User", email: "admin@example.com", password: "admin12345", role: "ADMIN" });
  await upsertUser({ name: "Enumerator User", email: "enum@example.com", password: "enum12345", role: "ENUMERATOR" });
  console.log("Seed completed.");
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
