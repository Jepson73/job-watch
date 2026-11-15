// Node: Code "Prepare ad"
// Mode: Run Once for All Items
// Turns the JobTech ad into the text the model reads, as {ad} in the prompt.
// The labels follow the prompt's language: coverLetter.adLabels in the profile, Swedish by default.

const a = $input.first().json;
const p = $('Select person').first().json;
const AD = {
  title: 'Tjänst', employer: 'Arbetsgivare', town: 'Ort', employment: 'Anställningsform', deadline: 'Sista ansökningsdag',
  required: 'Krav', merit: 'Meriterande', text: 'Annonstext',
  ...(p.coverLetter?.adLabels || {})
};
const list = arr => (arr || []).map(x => x.label).filter(Boolean).join(', ');

const ad = [
  `${AD.title}: ${a.headline || ''}`,
  `${AD.employer}: ${a.employer?.name || ''}`,
  `${AD.town}: ${a.workplace_address?.municipality || ''}`,
  `${AD.employment}: ${a.employment_type?.label || ''}${a.duration?.label ? ', ' + a.duration.label : ''}`,
  `${AD.deadline}: ${(a.application_deadline || '').slice(0, 10)}`,
  list(a.must_have?.skills) ? `${AD.required}: ${list(a.must_have.skills)}` : '',
  list(a.nice_to_have?.skills) ? `${AD.merit}: ${list(a.nice_to_have.skills)}` : '',
  '',
  `${AD.text}:`,
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
