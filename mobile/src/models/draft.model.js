// Draft model (local-only)
export function createDraft(data = {}) {
  return {
    draftId: data.draftId || String(Date.now()),
    serverSubmissionId: data.serverSubmissionId || null,
    formTypeId: data.formTypeId || null,
    year: data.year || null,
    mappingId: data.mappingId || null,
    schemaVersionId: data.schemaVersionId || null,
    location: data.location || {},
    answers: data.answers || {},
    updatedAt: data.updatedAt || Date.now(),
    dirty: data.dirty ?? true,
    status: data.status || "draft",
  };
}
