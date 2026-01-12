// mobile/src/storage/offlineStore.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const DRAFTS_KEY = "offline:drafts";
const FORMS_KEY = "offline:forms";

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function toYear(v) {
  const y = toInt(String(v ?? "").trim());
  if (!y) return null;
  if (y < 1900 || y > 3000) return null;
  return y;
}

async function read(key) {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function write(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
}

/* ---------------- drafts ---------------- */

export async function listDrafts() {
  return read(DRAFTS_KEY);
}

export async function saveDraft(draft) {
  const drafts = await read(DRAFTS_KEY);

  const id = String(draft?.draftId ?? "").trim();
  if (!id) return draft;

  const i = drafts.findIndex((d) => String(d?.draftId) === id);
  if (i >= 0) drafts[i] = draft;
  else drafts.push(draft);

  await write(DRAFTS_KEY, drafts);
  return draft;
}

export async function deleteDraft(draftId) {
  const drafts = await read(DRAFTS_KEY);
  const id = String(draftId ?? "").trim();
  await write(DRAFTS_KEY, drafts.filter((d) => String(d?.draftId) !== id));
}

/* ---------------- downloaded forms ---------------- */

function normalizeDownloadedForm(form) {
  const formTypeId = toInt(form?.formTypeId ?? form?.form_type_id ?? form?.id);
  const year = toYear(form?.year);

  // keep original payload fields, but enforce numeric keys
  return {
    ...form,
    formTypeId: formTypeId ?? form?.formTypeId,
    year: year ?? form?.year,
  };
}

export async function listDownloadedForms() {
  const forms = await read(FORMS_KEY);

  // normalize existing stored entries too (prevents old string years breaking lookups)
  const normalized = (forms || [])
    .map(normalizeDownloadedForm)
    .filter((f) => toInt(f?.formTypeId) && toYear(f?.year));

  // Optional: de-dup after normalization
  const seen = new Set();
  const deduped = [];
  for (const f of normalized) {
    const k = `${toInt(f.formTypeId)}:${toYear(f.year)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(f);
  }

  // If we cleaned anything, persist back (one-time cleanup)
  if (deduped.length !== (forms || []).length) {
    await write(FORMS_KEY, deduped);
  }

  return deduped;
}

export async function saveDownloadedForm(form) {
  const forms = await read(FORMS_KEY);
  const nf = normalizeDownloadedForm(form);

  const formTypeId = toInt(nf?.formTypeId);
  const year = toYear(nf?.year);

  if (!formTypeId || !year) return nf;

  // normalize all existing before compare
  const normalized = (forms || []).map(normalizeDownloadedForm);

  const i = normalized.findIndex(
    (f) => toInt(f?.formTypeId) === formTypeId && toYear(f?.year) === year
  );

  if (i >= 0) normalized[i] = { ...normalized[i], ...nf, formTypeId, year };
  else normalized.push({ ...nf, formTypeId, year });

  await write(FORMS_KEY, normalized);
  return { ...nf, formTypeId, year };
}

export async function deleteDownloadedForm(formTypeId, year) {
  const forms = await read(FORMS_KEY);
  const ft = toInt(formTypeId);
  const y = toYear(year);

  if (!ft || !y) return;

  const normalized = (forms || []).map(normalizeDownloadedForm);
  await write(
    FORMS_KEY,
    normalized.filter((f) => !(toInt(f?.formTypeId) === ft && toYear(f?.year) === y))
  );
}
