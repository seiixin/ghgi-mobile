import { verifyAccessToken } from "../utils/jwt.js";
import { pool } from "../db/pool.js";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const parts = header.split(" ");
  const token = parts.length === 2 ? parts[1] : "";
  if (!token) return res.status(401).json({ message: "Missing bearer token" });

  try {
    const decoded = verifyAccessToken(token);
    const userId = Number(decoded.sub);
    const [rows] = await pool.execute("SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1", [userId]);
    const user = rows?.[0];
    if (!user) return res.status(401).json({ message: "User not found" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid/expired token" });
  }
}
