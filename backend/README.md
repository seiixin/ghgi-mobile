# GHGI Mobile API (M0-M1)

## Endpoints
- GET  /api/health
- POST /api/auth/signup (optional; set ALLOW_SIGNUP=0 to disable)
- POST /api/auth/login
- POST /api/auth/refresh
- POST /api/auth/logout
- GET  /api/me

## Assumptions
- Existing Laravel `users` table exists with columns: id,name,email,password,role,...
- This service creates only: `devices`, `refresh_tokens`

## Quick start
1) Copy env:
   - Windows: `copy .env.example .env`
2) Install: `npm install`
3) Migrate: `npm run migrate`
4) Seed demo users (optional): `npm run seed`
5) Run: `npm run dev`
