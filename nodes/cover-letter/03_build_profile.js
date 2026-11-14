// Node: Code "Build profile"
// Mode: Run Once for All Items
// Builds what the model gets for this person and this ad: the profile text, the gaps the ad
// asks for that the person doesn't have, previous employers, and the finished prompt.
// Everything person-specific comes from coverLetter in the profile file.

const d = $input.first().json;
const p = $('Select person').first().json;
const C = p.coverLetter;
const ad = d.ad || '';

const RE = (s, flags = 'i') => new RegExp(s, flags);
const fill = (template, values) => String(template || '')
  .replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
const joinList = (xs, and) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`;
const capital = s => s.replace(/^./, c => c.toUpperCase());

// ===== Language: the letter follows the ad's language =====
let language = 'sv';
if (C.detectLanguage) {
  const words = ad.toLowerCase().match(/[a-zåäö]+/g) || [];
  const EN = ['the', 'and', 'you', 'with', 'we', 'our', 'will', 'for', 'are', 'of', 'your', 'to'];
  const SV = ['och', 'att', 'du', 'med', 'vi', 'som', 'för', 'är', 'på', 'av', 'din', 'till'];
  language = words.filter(w => EN.includes(w)).length > words.filter(w => SV.includes(w)).length ? 'en' : 'sv';
}

// ===== Outside the person's field: no letter at all =====
let outOfField = false;
if (C.outOfField && (d.occupation || d.occupationField)) {
  outOfField = !(C.outOfField.allowedFields || []).includes(d.occupationField)
    && !RE(C.outOfField.occupationRe).test(`${d.occupation} ${d.title}`);
}

// ===== Variables: text that depends on the ad or the date =====
//   { "adMatches": "power bi", "then": "...", "else": "" }   or   { "dateBefore": "2027-03-01", "then": "...", "else": "..." }
const vars = {};
for (const [name, v] of Object.entries(C.variables || {})) {
  const yes = v.adMatches != null ? RE(v.adMatches).test(ad)
    : v.dateBefore != null ? new Date() < new Date(v.dateBefore)
    : false;
  vars[name] = yes ? (v.then ?? '') : (v.else ?? '');
}
for (let i = 0; i < 3; i++) for (const k of Object.keys(vars)) vars[k] = fill(vars[k], vars);   // variables may use variables
const profileFacts = fill(C.profile, vars);

// ===== Skills the ad names that the person doesn't have =====
// The model is told not to write about them; the code writes one honest sentence instead,
// so that sentence is always true.
const MS = C.missingSkills || { items: [] };
const skillList = (MS.items || []).map(s => ({ ...s, regex: new RegExp(s.re, s.flags ?? '') }));
const missing = skillList.filter(s => s.regex.test(ad));
// Built for both languages: if the model writes in the other language, "Build email" switches to that one
const honestFor = lang => {
  if (!missing.length) return '';
  const S = (MS.sentences || {})[lang] || (MS.sentences || {}).sv || {};
  const studied = missing.filter(s => s.studied).map(s => s.name);
  const never = missing.filter(s => !s.studied).map(s => s.name);
  // {it} becomes "it" or "them" (S.it / S.them) depending on how many skills there are
  const pronoun = n => n > 1 ? (S.them || '') : (S.it || '');
  return [
    studied.length && S.studied ? capital(fill(S.studied, { items: joinList(studied, S.and || 'och'), it: pronoun(studied.length) })) : '',
    never.length && S.never ? capital(fill(S.never, { items: joinList(never, S.or || S.and || 'och'), it: pronoun(never.length) })) : '',
    S.after || ''
  ].filter(Boolean).join(' ');
};
const honestSentence = honestFor(language);
const honestByLanguage = { sv: honestFor('sv'), en: honestFor('en') };

// ===== Gaps: what the ad asks for that the person doesn't have =====
const gaps = [];
for (const g of (C.gaps || [])) {
  if (g.missingSkills) {
    if (missing.length) gaps.push({ name: missing.map(s => s.name).join(', '), text: fill(MS.gapText, { items: missing.map(s => s.name).join(', ') }) });
  } else if (RE(g.re, g.flags ?? 'i').test(ad)) {
    gaps.push({ name: g.name, text: g.text });
  }
}
const gapSection = gaps.length ? `\n\n${C.gapHeader}\n` + gaps.map(g => '- ' + g.text).join('\n') : '';

// ===== Current or previous employer =====
const employer = (C.previousEmployers || []).find(e => RE(e.re).test(d.employer || ''));
const employerSection = employer ? `\n\n${fill(C.previousEmployerTemplate || '{text}', { text: employer.text })}` : '';

// ===== Extra sections depending on the ad =====
const extra = (C.extraSections || [])
  .filter(x => (x.ifAd == null || RE(x.ifAd).test(ad)) && (x.unlessAd == null || !RE(x.unlessAd).test(ad)))
  .map(x => `\n\n${x.text}`).join('');

const profile = profileFacts + gapSection + employerSection + extra;
const remote = C.remoteRe ? RE(C.remoteRe).test(ad) : false;
const motivation = (d.motivation || '').trim() || C.motivationDefault || '';

// Models follow the last instruction best, and the Swedish JSON field names pull them towards Swedish.
const REMINDER = {
  en: 'VIKTIGT OM SPRÅKET: Annonsen är på engelska. Skriv ALL text i JSON-fälten på engelska (brittisk stavning), även om fältnamnen är på svenska. Bara "tips" skrivs på svenska.',
};
const reminder = C.languageReminder?.[language] ?? REMINDER[language] ?? '';

const prompt = fill(C.prompt, {
  profile,
  style: C.style || '',
  ad,
  motivation,
  languageName: (C.languageNames || {})[language] || (language === 'en' ? 'engelska' : 'svenska'),
  remote: remote ? 'ja' : 'nej'
}) + (reminder ? '\n\n' + reminder : '');

return [{ json: {
  ...d,
  person: p.id,
  language,
  outOfField,
  prompt,
  profileFacts,
  gaps: gaps.map(g => g.name),
  missingSkills: missing.map(s => s.name),
  honestSentence,
  honestByLanguage
} }];
