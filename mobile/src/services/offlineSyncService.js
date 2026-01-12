// Offline sync service (business logic)
import * as store from "../storage/offlineStore";
import { submitDraft as submitDraftApi } from "../lib/offlineSyncApi";

export async function getAllDrafts() {
  return store.listDrafts();
}

export async function saveDraft(draft) {
  return store.saveDraft({ ...draft, updatedAt: Date.now(), dirty: true });
}

export async function removeDraft(draftId) {
  return store.deleteDraft(draftId);
}

export async function submitDraftOnline(draft) {
  const submissionId = await submitDraftApi(draft);
  await store.deleteDraft(draft.draftId);
  return submissionId;
}
