import { Router } from "express";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { randomToken, sha256Hex } from "../utils/crypto.js";
import { signAccessToken, signRefreshJwt, verifyRefreshJwt } from "../utils/jwt.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

function bad(res, msg, code = 400) {
  return res.status(code).json({ message: msg });
}

async function upsertDevice({ userId, deviceId, platform, deviceName, isLogin }) {
  if (!deviceId) return;
  await pool.execute(
    `INSERT INTO devices (user_id, device_id, platform, device_name, last_login_at, last_seen_at)
     VALUES (?, ?, ?, ?, ${isLogin ? "NOW()" : "NULL"}, NOW())
     ON DUPLICATE KEY UPDATE
       platform=VALUES(platform),
       device_name=VALUES(device_name),
       last_seen_at=NOW(),
       last_login_at=IF(${isLogin ? "1" : "0"}=1, NOW(), last_login_at)`,
    [userId, deviceId, platform || null, deviceName || null]
  );
}

function refreshExpiryDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function issueTokens({ user, deviceId }) {
  const accessToken = signAccessToken(user);

  const opaque = randomToken(32);
  const refreshJwt = signRefreshJwt(user.id, deviceId || "unknown");
  const refreshToken = `${refreshJwt}.${opaque}`;

  const tokenHash = sha256Hex(refreshToken);
  const expiresAt = refreshExpiryDate(env.auth.refreshTtlDays);

  await pool.execute(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL",
    [user.id, deviceId || "unknown"]
  );

  await pool.execute(
    "INSERT INTO refresh_tokens (user_id, device_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    [user.id, deviceId || "unknown", tokenHash, expiresAt]
  );

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: env.auth.accessTtlMinutes * 60,
  };
}

authRouter.post("/auth/signup", async (req, res) => {
  if (!env.auth.allowSignup) return bad(res, "Signup disabled", 403);

  const { name, email, password, device_id, platform, device_name } = req.body || {};
  const n = (name || "").toString().trim();
  const e = (email || "").toString().trim().toLowerCase();
  const p = (password || "").toString();

  if (!n) return bad(res, "Name required");
  if (!e) return bad(res, "Email required");
  if (p.length < 6) return bad(res, "Password must be at least 6 chars");

  const [exists] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [e]);
  if (exists.length) return bad(res, "Email already exists", 409);

  const hash = await bcrypt.hash(p, 12);
  const [result] = await pool.execute(
    "INSERT INTO users (name, email, password, role, created_at, updated_at) VALUES (?, ?, ?, 'ENUMERATOR', NOW(), NOW())",
    [n, e, hash]
  );

  const userId = result.insertId;
  const [rows] = await pool.execute("SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1", [userId]);
  const user = rows[0];

  const deviceId = (device_id || "").toString().trim();
  await upsertDevice({ userId: user.id, deviceId, platform, deviceName: device_name, isLogin: true });

  const tokens = await issueTokens({ user, deviceId });
  res.json({ user, ...tokens });
});

authRouter.post("/auth/login", async (req, res) => {
  const { email, password, device_id, platform, device_name } = req.body || {};
  const e = (email || "").toString().trim().toLowerCase();
  const p = (password || "").toString();
  const deviceId = (device_id || "").toString().trim();

  if (!e) return bad(res, "Email required");
  if (!p) return bad(res, "Password required");
  if (!deviceId) return bad(res, "device_id required");

  const [rows] = await pool.execute("SELECT id, name, email, password, role FROM users WHERE email = ? LIMIT 1", [e]);
  const userRow = rows?.[0];
  if (!userRow) return bad(res, "Invalid credentials", 401);

  const ok = await bcrypt.compare(p, userRow.password);
  if (!ok) return bad(res, "Invalid credentials", 401);

  const user = { id: userRow.id, name: userRow.name, email: userRow.email, role: userRow.role };

  await upsertDevice({ userId: user.id, deviceId, platform, deviceName: device_name, isLogin: true });

  const tokens = await issueTokens({ user, deviceId });
  res.json({ user, ...tokens });
});

authRouter.post("/auth/refresh", async (req, res) => {
  const { refresh_token, device_id } = req.body || {};
  const rt = (refresh_token || "").toString();
  const deviceId = (device_id || "").toString().trim();
  if (!rt) return bad(res, "refresh_token required");
  if (!deviceId) return bad(res, "device_id required");

  // validate refresh JWT part
  const jwtPart = rt.split(".").slice(0,3).join(".");
  try {
    const decoded = verifyRefreshJwt(jwtPart);
    if (String(decoded.did) !== String(deviceId)) return bad(res, "Device mismatch", 401);
  } catch {
    return bad(res, "Invalid refresh token", 401);
  }

  const tokenHash = sha256Hex(rt);
  const [rows] = await pool.execute(
    "SELECT id, user_id, device_id, revoked_at, expires_at FROM refresh_tokens WHERE token_hash = ? LIMIT 1",
    [tokenHash]
  );
  const row = rows?.[0];
  if (!row) return bad(res, "Invalid refresh token", 401);
  if (row.revoked_at) return bad(res, "Refresh token revoked", 401);
  if (new Date(row.expires_at).getTime() <= Date.now()) return bad(res, "Refresh token expired", 401);
  if (String(row.device_id) !== String(deviceId)) return bad(res, "Device mismatch", 401);

  // rotate: revoke current, issue new
  await pool.execute("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?", [row.id]);

  const [urows] = await pool.execute("SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1", [row.user_id]);
  const user = urows?.[0];
  if (!user) return bad(res, "User not found", 401);

  const tokens = await issueTokens({ user, deviceId });
  res.json({ user, ...tokens });
});

authRouter.post("/auth/logout", requireAuth, async (req, res) => {
  const { device_id } = req.body || {};
  const deviceId = (device_id || "").toString().trim();
  if (!deviceId) return bad(res, "device_id required");

  await pool.execute(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL",
    [req.user.id, deviceId]
  );
  res.json({ ok: true });
});
