// Offline sync API wrapper
import { saveDownloadedForm } from "../storage/offlineStore";
import { fetchFormSchema } from "./forms";
import { createSubmission, upsertAnswers, submitSubmission } from "./submissionsApi";

export async function downloadForm({ formTypeId, year }) {
  const payload = await fetchFormSchema(formTypeId, year);
  return saveDownloadedForm(payload);
}

export async function submitDraft(draft) {
  let submissionId = draft.serverSubmissionId;
  if (!submissionId) {
    const res = await createSubmission(draft);
    submissionId = res.submission.id;
  }
  await upsertAnswers(submissionId, draft.answers, draft.location);
  await submitSubmission(submissionId);
  return submissionId;
}
