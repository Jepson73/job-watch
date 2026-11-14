// Node: Code "Prepare ad"
// Mode: Run Once for All Items
// Turns the JobTech ad into the text the model reads. The labels are Swedish because the prompts are.

const a = $input.first().json;
const p = $('Select person').first().json;
const list = arr => (arr || []).map(x => x.label).filter(Boolean).join(', ');

const ad = [
  `Tjänst: ${a.headline || ''}`,
  `Arbetsgivare: ${a.employer?.name || ''}`,
  `Ort: ${a.workplace_address?.municipality || ''}`,
  `Anställningsform: ${a.employment_type?.label || ''}${a.duration?.label ? ', ' + a.duration.label : ''}`,
  `Sista ansökningsdag: ${(a.application_deadline || '').slice(0, 10)}`,
  list(a.must_have?.skills) ? `Krav: ${list(a.must_have.skills)}` : '',
  list(a.nice_to_have?.skills) ? `Meriterande: ${list(a.nice_to_have.skills)}` : '',
  '',
  'Annonstext:',
  (a.description?.text || '').slice(0, 8000)
].filter(x => x !== '').join('\n');

return [{ json: {
  ad,
  title: a.headline || '',
  employer: a.employer?.name || '',
  url: a.webpage_url || '',
  reference: a.application_details?.reference || '',
  occupation: a.occupation?.label || '',
  occupationField: a.occupation_field?.label || '',
  motivation: p.motivation
} }];
