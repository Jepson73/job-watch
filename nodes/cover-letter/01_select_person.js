// Node: Code "Select person"
// Mode: Run Once for All Items
// Picks the profile named in the form's hidden "person" field (set by the link in the job email).

const raw = $('Cover letter form').first().json;
// Depending on the Form Trigger version, answers are keyed by field name or by field label
const field = (name, label) => raw[name] ?? raw[label] ?? '';
const form = {
  person: field('person', 'person'),
  annons_id: field('annons_id', 'Annons-ID'),
  motivering: field('motivering', 'Vad lockar dig med just det här jobbet?'),
};
const files = $input.all().map(i => i.json.data ?? i.json);
const global = files.find(f => f && f.global === true) || {};
const id = String(form.person || '').trim().toLowerCase();
const p = files.find(f => f && f.id === id && f.coverLetter);

if (!p) throw new Error(`No profile with a coverLetter section for person "${id}". The form link must include ?person=<id>.`);
if (!String(form.annons_id).trim()) throw new Error(`No ad id in the form. Fields received: ${Object.keys(raw).join(', ')}`);

return [{ json: {
  ...p,
  global,
  adId: String(form.annons_id || '').trim(),
  motivation: form.motivering || ''
} }];
