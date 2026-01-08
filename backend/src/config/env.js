import dotenv from "dotenv";
dotenv.config();

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const env = {
  port: parseInt(process.env.PORT || "4000", 10),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  db: {
    host: required("DB_HOST"),
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
    database: required("DB_NAME"),
  },
  auth: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessTtlMinutes: parseInt(process.env.JWT_ACCESS_TTL_MINUTES || "15", 10),
    refreshTtlDays: parseInt(process.env.JWT_REFRESH_TTL_DAYS || "30", 10),
    allowSignup: (process.env.ALLOW_SIGNUP ?? "1") !== "0",
  },
};
