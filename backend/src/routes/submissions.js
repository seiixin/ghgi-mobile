import { Router } from "express";
import { requireAuth } from "../middleware/auth.js"; // adjust path/name to your project
import {
  listSubmissions,
  createSubmission,
  getSubmission,
  updateSubmission,
  upsertSubmissionAnswers,
  submitSubmission,
} from "../controllers/submissionsController.js";

export const submissionsRouter = Router();

// protect all submissions endpoints
submissionsRouter.use(requireAuth);

submissionsRouter.get("/submissions", listSubmissions);
submissionsRouter.post("/submissions", createSubmission);
submissionsRouter.get("/submissions/:id", getSubmission);
submissionsRouter.patch("/submissions/:id", updateSubmission);
submissionsRouter.put("/submissions/:id/answers", upsertSubmissionAnswers);
submissionsRouter.post("/submissions/:id/submit", submitSubmission);
