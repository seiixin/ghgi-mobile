// Downloaded form model
export function createDownloadedForm(data = {}) {
  return {
    formTypeId: data.formTypeId,
    year: data.year,
    mappingId: data.mappingId,
    schemaVersionId: data.schemaVersionId,
    mappingJson: data.mappingJson || {},
    downloadedAt: data.downloadedAt || Date.now(),
  };
}
