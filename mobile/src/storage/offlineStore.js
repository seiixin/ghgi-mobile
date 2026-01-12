// Offline storage (AsyncStorage-based)
import AsyncStorage from "@react-native-async-storage/async-storage";

const DRAFTS_KEY = "offline:drafts";
const FORMS_KEY = "offline:forms";

async function read(key) {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
}
async function write(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function listDrafts() {
  return read(DRAFTS_KEY);
}
export async function saveDraft(draft) {
  const drafts = await read(DRAFTS_KEY);
  const i = drafts.findIndex(d => d.draftId === draft.draftId);
  if (i >= 0) drafts[i] = draft;
  else drafts.push(draft);
  await write(DRAFTS_KEY, drafts);
  return draft;
}
export async function deleteDraft(draftId) {
  const drafts = await read(DRAFTS_KEY);
  await write(DRAFTS_KEY, drafts.filter(d => d.draftId !== draftId));
}

export async function listDownloadedForms() {
  return read(FORMS_KEY);
}
export async function saveDownloadedForm(form) {
  const forms = await read(FORMS_KEY);
  const i = forms.findIndex(
    f => f.formTypeId === form.formTypeId && f.year === form.year
  );
  if (i >= 0) forms[i] = form;
  else forms.push(form);
  await write(FORMS_KEY, forms);
  return form;
}
export async function deleteDownloadedForm(formTypeId, year) {
  const forms = await read(FORMS_KEY);
  await write(
    FORMS_KEY,
    forms.filter(f => !(f.formTypeId === formTypeId && f.year === year))
  );
}
