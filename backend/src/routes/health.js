import { Router } from "express";
export const healthRouter = Router();

healthRouter.get("/health", (req, res) => {
  res.json({ ok: true, name: "GHGI API", modules: ["M0", "M1"] });
});
