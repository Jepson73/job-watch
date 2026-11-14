// Node: Code "Select person"
// Mode: Run Once for All Items
// Picks the profile named in the form's hidden "person" field (set by the link in the job email).

const form = $('Cover letter form').first().json;
const files = $input.all().map(i => i.json.data ?? i.json);
const global = files.find(f => f && f.global === true) || {};
const id = String(form.person || '').trim().toLowerCase();
const p = files.find(f => f && f.id === id && f.coverLetter);

if (!p) throw new Error(`No profile with a coverLetter section for person "${id}". The form link must include ?person=<id>.`);

return [{ json: {
  ...p,
  global,
  adId: String(form.annons_id || '').trim(),
  motivation: form.motivering || ''
} }];
