// Node: Code "Build email"
// Mode: Run Once for All Items
// Takes the model's letter parts (JSON), cleans the language, removes claims the person can't back up,
// and builds the finished letter with header, recipient and title, plus warnings and tips for the person.
// The email around the letter is in Swedish (STRINGS); the letter itself is in the ad's language.

const STRINGS = {
  subject: 'Utkast till personligt brev: {title}',
  subjectNoLetter: 'Inget brev: {title} är ett annat yrke',
  intro: 'Utkast till personligt brev för {link} hos {employer}. Brevet finns också som bifogad Word-fil. Läs igenom, ändra det som inte låter som du, och skicka.',
  introNoLetter: 'Gäller {link} hos {employer}.',
  noLetterTitle: 'Inget brev skrivet.',
  noLetterBody: 'Tjänsten gäller {occupation}, inte {field}. Annonsens krav ligger utanför det du har arbetat med, så ett brev skulle behöva påstå kunskaper du inte har.',
  noLetterAsk: 'Var det ändå rätt annons? Hör av dig, så tittar vi på varför den kom med i jobbmejlet.',
  anotherOccupation: 'ett annat yrke',
  failed: 'Något gick fel, modellen gav inget brev i rätt format. Prova att skicka formuläret igen.',
  rawAnswer: 'Råsvar',
  check: 'Kontrollera',
  think: 'Att fundera på',
  warnGaps: 'Annonsen efterfrågar något du inte har enligt profilen: {gaps}. Brevet säger det öppet. Kontrollera att formuleringen känns rätt för dig.',
  warnMentions: 'Brevet nämner {items}, som inte finns i din profil. Ta bort det om du inte har den kunskapen.',
  warnRemoved: 'Meningar som påstod att du kan {items} togs bort, eftersom det inte finns i din profil. Läs igenom att brevet hänger ihop.',
  warnFamiliar: 'Brevet påstod att du känner {employer} eller orten, men den står inte bland dina tidigare arbetsgivare. Det togs bort ur meningen: "{sentence}"',
  warnLanguage: 'Annonsen är på {asked}, men modellen skrev brevet på {got}. Hela brevet är därför på {got}. Vill du ha det på {asked}, skicka formuläret igen.',
  languageNames: { sv: 'svenska', en: 'engelska' },
  // The model's JSON field names, as they should read in the tips
  fieldWords: { inledning: 'inledningen', matchning: 'stycket om hur du matchar annonsen', bidrag: 'stycket om vad du bidrar med',
    utveckling: 'stycket om vad du vill utvecklas i', avslutning: 'avslutningen', glimt: 'den avslutande glimten' },
};
const LETTER = {
  sv: { hello: 'Hej,', regards: 'Med vänliga hälsningar', application: 'Ansökan', reference: 'Referens', locale: 'sv-SE',
        fallbackClosing: 'Jag berättar gärna mer om hur min erfarenhet kan komma till nytta hos er.' },
  en: { hello: 'Hello,', regards: 'Kind regards', application: 'Application', reference: 'Reference', locale: 'en-GB',
        fallbackClosing: 'I would be glad to tell you more about how my experience can be of use to you.' },
};

// The JSON fields the person's prompt asks the model for, in letter order (coverLetter.answer).
//   field: name, or a list of names where the first one present is used
//   honestSentence: the code's honest sentence about missing skills goes first in this paragraph
//   list: the field may hold several paragraphs;  joke: a one-line field appended to the last of them
//   keepAsIs: skip the missing-skill and example checks for this field
const DEFAULT_ANSWER = {
  paragraphs: [
    { field: 'inledning' },
    { field: 'matchning', honestSentence: true },
    { field: ['bidrag', 'exempel'], list: true, joke: 'glimt' },
    { field: ['intresse', 'motivation'], keepAsIs: true },
    { field: 'utveckling' },
    { field: 'avslutning' },
  ],
  tips: 'tips',
};

const b = $('Build profile').first().json;
const p = $('Select person').first().json;
const G = p.global || {};
const C = p.coverLetter;
const ANSWER = C.answer || DEFAULT_ANSWER;
const names = spec => [].concat(spec.field);
const valueOf = (parts, spec) => { for (const n of names(spec)) if (parts[n] != null && parts[n] !== '') return parts[n]; return undefined; };
// Any entry in STRINGS can be overridden per person with coverLetter.strings
Object.assign(STRINGS, C.strings || {});
const K = C.contact || { name: p.name, town: '', phone: '', email: '' };
const fill = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const asList = x => Array.isArray(x) ? x : (x ? [x] : []);
const sentences = t => String(t || '').split(/(?<=[.!?])\s+/);

// "MARIESTADS KOMMUN" -> "Mariestads kommun", "Region skåne" -> "Region Skåne"
const tidy = t => {
  if (!t) return t;
  const s = t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
  return s.replace(/^(Region|Landstinget)\s+([a-zåäö])/, (m, r, c) => `${r} ${c.toUpperCase()}`);
};
const employer = tidy(b.employer);

// ----- Read the model's answer -----
const raw = String($input.first().json.text || '')
  .replace(/<think>[\s\S]*?<\/think>/g, '')
  .replace(/```(?:json)?/g, '')
  .trim();
let parts = null;
try { parts = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch (e) {}

// ----- Which language did the model actually write in? -----
// If it ignored the instruction, the whole letter follows the model (header, honest sentence, closing),
// so the letter is never half Swedish, half English. The person is told.
const languageOf = text => {
  const w = String(text).toLowerCase().match(/[a-zåäö]+/g) || [];
  const EN = ['the', 'and', 'you', 'with', 'we', 'our', 'will', 'for', 'are', 'of', 'your', 'to', 'i', 'my', 'have', 'in'];
  const SV = ['och', 'att', 'du', 'med', 'vi', 'som', 'för', 'är', 'på', 'av', 'din', 'till', 'jag', 'min', 'har', 'i'];
  const en = w.filter(x => EN.includes(x)).length, sv = w.filter(x => SV.includes(x)).length;
  return en + sv < 5 ? null : (en > sv ? 'en' : 'sv');
};
const written = parts ? languageOf(ANSWER.paragraphs.filter(sp => !sp.keepAsIs)
  .flatMap(sp => [].concat(parts[names(sp)[0]] || [])).join(' ')) : null;
const language = written || b.language;
const switched = !!written && written !== b.language;
// coverLetter.letterTexts overrides the header and closing texts per language, e.g. { "sv": { "hello": "Hej!" } }
const L = { ...(LETTER[language] || LETTER.sv), ...((C.letterTexts || {})[language] || {}) };
const honestSentence = (b.honestByLanguage || {})[language] ?? b.honestSentence;

// ----- Cleanup rules from the profile (coverLetter.cleanup) -----
// Every rule is [regex, flags, replacement] or [regex, flags, replacement, scope], applied in order.
//   normalize:     applied to every text (letter paragraphs, tips, the joke line)
//   replacements:  applied to the letter paragraphs. scope "notLast" = not in the closing paragraph,
//                  "last" = only in the closing paragraph. In a replacement, \U$2 means group 2 in upper case.
//   dropSentencesRe: sentences matching it are removed from the letter.
const CL = C.cleanup || {};
const compile = rules => (rules || []).map(([re, flags, to, scope]) => ({ re: new RegExp(re, flags ?? 'g'), to: String(to ?? ''), scope: scope || 'all' }));
const apply = (t, rule) => rule.to.includes('\\U$')
  ? t.replace(rule.re, (...m) => rule.to.replace(/\\U\$(\d)/g, (x, n) => String(m[n] ?? '').toUpperCase()).replace(/\$(\d)/g, (x, n) => m[n] ?? ''))
  : t.replace(rule.re, rule.to);
const NORMALIZE = compile(CL.normalize);
const REPLACE = compile(CL.replacements);
const DROP = CL.dropSentencesRe ? new RegExp(CL.dropSentencesRe, 'i') : null;

const clean = s => NORMALIZE.reduce(apply, String(s || '')).replace(/\s+/g, ' ').trim();
const unfill = (paragraph, isLast) => {
  const t = REPLACE
    .filter(r => r.scope === 'all' || (r.scope === 'last') === isLast)
    .reduce(apply, paragraph);
  return sentences(t).filter(x => !(DROP && DROP.test(x))).join(' ').replace(/^\w/, c => c.toUpperCase()).trim();
};

// ----- Claims the profile can't back up -----
// unknownTerms: systems, laws and tools not in the profile. A sentence claiming one is removed,
// unless it matches cleanup.negationRe (says the person does NOT have it). Case-sensitive.
const NEGATION = CL.negationRe ? new RegExp(CL.negationRe) : /$^/;
const termRe = t => new RegExp(`(^|[^\\wåäöÅÄÖ])${t.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&')}($|[^\\wåäöÅÄÖ])`);
const profileHas = sentences(b.profileFacts).flatMap(s => s.split('\n')).filter(s => !NEGATION.test(s)).join('\n');
const unknown = (C.unknownTerms || []).filter(t => !termRe(t).test(profileHas));
const removed = [];
const dropUnknownClaims = s => sentences(s).filter(m => {
  const hit = unknown.filter(t => termRe(t).test(m));
  if (hit.length && !NEGATION.test(m)) { removed.push(...hit); return false; }
  return true;
}).join(' ').trim();

// Familiarity claims ("en kommun jag känner väl") are only allowed when the profile lists the employer under
// previousEmployers. Otherwise the clause, or the whole sentence, is removed. The patterns are cleanup.familiarityRe;
// without them there is no check.
const knowsEmployer = !CL.familiarityRe
  || (C.previousEmployers || []).some(e => new RegExp(e.re, 'i').test(b.employer || ''));
const FAMILIAR = new RegExp(CL.familiarityRe || '$^', 'i');
const familiarRemoved = [];
const dropFamiliarity = (t, quiet = false) => knowsEmployer || !t ? t : sentences(t).map(m => {
  if (!FAMILIAR.test(m)) return m;
  if (!quiet) familiarRemoved.push(m);
  // Keep the part before the claim if there is one ("…i Borås, en stad jag känner väl…" -> "…i Borås.")
  const keep = [];
  for (const part of m.split(/,\s+/)) { if (FAMILIAR.test(part)) break; keep.push(part); }
  if (!keep.length) return '';
  const head = keep.join(', ').replace(/[,\s]+$/, '');
  return /[.!?]$/.test(head) ? head : head + '.';
}).filter(Boolean).join(' ');

// Missing skills: every sentence mentioning one is removed; the code's honest sentence replaces them.
const skillRes = (C.missingSkills?.items || []).map(s => ({ name: s.name, re: new RegExp(s.re, s.flags ?? '') }));
const missingRes = skillRes.filter(s => (b.missingSkills || []).includes(s.name)).map(s => s.re);
const dropMissing = t => !t ? t : sentences(t).filter(m => !missingRes.some(re => re.test(m))).join(' ');

// The joke line (answer.paragraphs[].joke) must not reuse the prompt's examples (cleanup.glimtExamples).
const EXAMPLES = C.cleanup?.glimtExamples || [];
const words = t => String(t).toLowerCase().match(/[a-zåäö]+/g) || [];
const resembles = (a, e) => { const aw = new Set(words(a)); const ew = words(e); return ew.length && ew.filter(w => aw.has(w)).length / ew.length >= 0.6; };
const dropExamples = t => !t ? t : sentences(t).filter(m => !EXAMPLES.some(e => resembles(m, e))).join(' ');

let letterHtml, letterData = null, tips = [];

if (b.outOfField) {
  letterHtml = `<p style="margin:0 0 12px"><b>${esc(STRINGS.noLetterTitle)}</b></p>
  <p style="margin:0 0 12px">${esc(fill(STRINGS.noLetterBody, { occupation: [b.occupation || STRINGS.anotherOccupation, b.occupationField ? `(${b.occupationField})` : ''].filter(Boolean).join(' '), field: C.outOfField?.fieldName || 'ditt yrkesområde' }))}</p>
  <p style="margin:0">${esc(STRINGS.noLetterAsk)}</p>`;
} else if (parts) {
  const pieces = [];
  for (const spec of ANSWER.paragraphs) {
    const check = t => spec.keepAsIs ? t : dropMissing(dropExamples(t));
    if (spec.list) {
      const items = asList(valueOf(parts, spec)).map(check);
      let joke = spec.joke ? clean(asList(parts[spec.joke])[0]) : '';
      if (joke && EXAMPLES.some(e => resembles(joke, e))) joke = '';
      if (joke && items.length) items[items.length - 1] = `${items[items.length - 1]} ${joke}`;
      else if (joke) items.push(joke);
      pieces.push(...items);
    } else {
      const v = check(valueOf(parts, spec));
      pieces.push(spec.honestSentence ? [honestSentence, v].filter(Boolean).join(' ') : v);
    }
  }

  const paragraphs = pieces.map(clean).filter(Boolean)
   .map((s, i, all) => unfill(s, i === all.length - 1))
   .map(dropUnknownClaims)
   .map(dropFamiliarity)
   .filter(Boolean);
  // No closing (cleanup.closingRe) in the last paragraph: add the language's fallback closing
  if (CL.closingRe && (!paragraphs.length || !new RegExp(CL.closingRe, 'i').test(paragraphs.at(-1)))) {
    paragraphs.push(L.fallbackClosing);
  }
  // Tips: same checks as the letter, and the model's JSON field names ('matchning') become plain words
  const FIELD_WORDS = STRINGS.fieldWords;
  const fieldRe = new RegExp(`['"‘’“”«»](${Object.keys(FIELD_WORDS).join('|')})['"‘’“”«»]`, 'gi');
  const plainFields = t => t.replace(fieldRe, (m, f) => FIELD_WORDS[f.toLowerCase()] ?? m);
  tips = asList(parts[ANSWER.tips || 'tips']).map(clean).map(dropUnknownClaims).map(t => dropFamiliarity(t, true)).map(plainFields).filter(Boolean).slice(0, 3);

  const date = new Intl.DateTimeFormat(L.locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const contactLines = [K.phone, K.email].filter(Boolean).map(esc).join('<br>');
  letterData = {
    name: K.name, town: K.town, phone: K.phone, email: K.email,
    employer, date, title: b.title, reference: b.reference, paragraphs,
    language, hello: L.hello, regards: L.regards, application: L.application, referenceLabel: L.reference
  };
  letterHtml = `
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:28px"><tr>
    <td style="vertical-align:top">${esc(K.name)}<br>${esc(K.town)}<br>${contactLines}</td>
    <td style="vertical-align:top;text-align:right">${esc(employer)}<br>${esc(K.town)} ${esc(date)}</td>
  </tr></table>
  <p style="margin:0 0 18px;font-size:17px"><b>${L.application}: ${esc(b.title)}</b>${b.reference ? `<br><span style="font-size:13px;color:#555">${L.reference}: ${esc(b.reference)}</span>` : ''}</p>
  <p style="margin:0 0 14px">${L.hello}</p>
  ${paragraphs.map(s => `<p style="margin:0 0 14px">${esc(s)}</p>`).join('\n  ')}
  <p style="margin:18px 0 0">${L.regards}<br>${esc(K.name)}</p>`;
} else {
  letterHtml = `<p>${esc(STRINGS.failed)}</p>
  <p style="font-size:12px;color:#888">${esc(STRINGS.rawAnswer)}: ${esc(raw.slice(0, 500))}</p>`;
}

// ----- Warnings to the person -----
const warnings = [];
if (!b.outOfField && (b.gaps || []).length) warnings.push(fill(STRINGS.warnGaps, { gaps: b.gaps.join(STRINGS.gapSeparator ?? '; ') }));
if (letterData) {
  // Mentions of skills from the list that the profile doesn't have (the code's own sentence and the job title don't count)
  const text = [honestSentence, b.title].filter(Boolean)
    .reduce((t, x) => t.split(x).join(' '), letterData.paragraphs.join(' '));
  const mentioned = skillRes.filter(s => s.re.test(text) && !s.re.test(b.profileFacts)).map(s => s.name);
  if (mentioned.length) warnings.push(fill(STRINGS.warnMentions, { items: mentioned.join(', ') }));
}
if (removed.length) warnings.push(fill(STRINGS.warnRemoved, { items: [...new Set(removed)].join(', ') }));
for (const m of familiarRemoved) warnings.push(fill(STRINGS.warnFamiliar, { sentence: m, employer }));
if (switched) warnings.push(fill(STRINGS.warnLanguage, { asked: STRINGS.languageNames[b.language], got: STRINGS.languageNames[language] }));

const box = (title, items, bg, border, colour = '#222') => items.length
  ? `<div style="background:${bg};border-left:4px solid ${border};padding:10px 14px;margin:0 0 16px;font-size:13px;color:${colour}"><b>${esc(title)}</b><ul style="margin:6px 0 0 18px;padding:0">${items.map(v => `<li>${esc(v)}</li>`).join('')}</ul></div>`
  : '';
const link = `<a href="${esc(b.url)}"><b>${esc(b.title)}</b></a>`;
const intro = fill(b.outOfField ? STRINGS.introNoLetter : STRINGS.intro, { link, employer: esc(employer) });

const html = `<div style="font-family:Arial,sans-serif;max-width:700px;color:#222">
  <p style="color:#555;font-size:13px">${intro}</p>
  ${box(STRINGS.check, warnings, '#fdecea', '#c62828', '#7a1c1c')}
  <div style="border:1px solid #ddd;border-radius:6px;padding:28px 32px;font-family:Georgia,serif;font-size:15px;line-height:1.55">${letterHtml}
  </div>
  ${tips.length ? `<div style="margin-top:18px">${box(STRINGS.think, tips, '#f6f3ee', '#c8a96a')}</div>` : ''}
</div>`;

const test = !!G.testTo;
const to = C.email?.to || p.email?.to;
const bcc = C.email?.bcc ?? p.email?.bcc ?? '';
return [{ json: {
  subject: `${test ? `[TEST ${p.id}] ` : ''}${fill(b.outOfField ? STRINGS.subjectNoLetter : STRINGS.subject, { title: b.title })}`,
  html,
  ok: !!parts && !b.outOfField,
  letter: letterData,
  from: G.from,
  to: test ? G.testTo : to,
  bcc: test ? '' : bcc
} }];
