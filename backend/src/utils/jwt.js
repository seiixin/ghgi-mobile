import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signAccessToken(user) {
  const payload = { sub: String(user.id), role: user.role ?? "ENUMERATOR" };
  return jwt.sign(payload, env.auth.accessSecret, { expiresIn: `${env.auth.accessTtlMinutes}m` });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.auth.accessSecret);
}

export function signRefreshJwt(userId, deviceId) {
  const payload = { sub: String(userId), did: String(deviceId) };
  return jwt.sign(payload, env.auth.refreshSecret, { expiresIn: `${env.auth.refreshTtlDays}d` });
}

export function verifyRefreshJwt(token) {
  return jwt.verify(token, env.auth.refreshSecret);
}
