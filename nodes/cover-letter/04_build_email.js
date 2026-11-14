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
  warnLanguage: 'Annonsen är på {asked}, men modellen skrev brevet på {got}. Hela brevet är därför på {got}. Vill du ha det på {asked}, skicka formuläret igen.',
  languageNames: { sv: 'svenska', en: 'engelska' },
};
const LETTER = {
  sv: { hello: 'Hej,', regards: 'Med vänliga hälsningar', application: 'Ansökan', reference: 'Referens', locale: 'sv-SE',
        fallbackClosing: 'Jag berättar gärna mer om hur min erfarenhet kan komma till nytta hos er.' },
  en: { hello: 'Hello,', regards: 'Kind regards', application: 'Application', reference: 'Reference', locale: 'en-GB',
        fallbackClosing: 'I would be glad to tell you more about how my experience can be of use to you.' },
};

const b = $('Build profile').first().json;
const p = $('Select person').first().json;
const G = p.global || {};
const C = p.coverLetter;
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
const written = parts ? languageOf(['inledning', 'matchning', 'bidrag', 'utveckling', 'avslutning']
  .flatMap(f => [].concat(parts[f] || [])).join(' ')) : null;
const language = written || b.language;
const switched = !!written && written !== b.language;
const L = LETTER[language] || LETTER.sv;
const honestSentence = (b.honestByLanguage || {})[language] ?? b.honestSentence;

// ----- Clean the language (Swedish) -----
const clean = s => String(s || '')
  .replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2')            // 2016–2023 -> 2016-2023
  .replace(/\s*[–—]\s*/g, ', ')                       // other dashes -> comma
  .replace(/,\s*,/g, ',')
  .replace(/,\s*([.!?:])/g, '$1')
  .replace(/\b(har|hade)((?:\s+\S+)?)\s+handlade\b/g, '$1$2 handlagt')   // "har jag handlade" -> "har jag handlagt"
  .replace(/\bhandlat\b(?!\s+om\b)/g, 'handlagt')
  .replace(/\bhandledt\b/g, 'handlett')
  .replace(/\s+/g, ' ')
  .trim();

// Filler the model writes anyway. The common rules are here; person-specific ones in coverLetter.cleanup.
const extraRules = (C.cleanup?.replacements || []).map(([re, flags, to]) => [new RegExp(re, flags ?? 'gi'), to]);
const DROP = new RegExp(['framgång|är övertygad|inspirerande|passionate|team player|I am confident|I am convinced', C.cleanup?.dropSentencesRe]
  .filter(Boolean).join('|'), 'i');
const unfill = (paragraph, isLast) => {
  let t = paragraph
    .replace(/\bgedig(en|et|na)\s+/gi, '')
    .replace(/\bintake\b/gi, 'telefonmottagning')
    .replace(/\bbästa praxis\b/gi, 'det som fungerat bäst')
    .replace(/\bbest practice\b/gi, 'det som fungerat bäst')
    .replace(/\bvilket jag tror\b/gi, 'vilket')
    .replace(/\bjag tror att (det|detta)\b/gi, '$1')
    .replace(/\bmin expertis\b/gi, 'min erfarenhet');
  for (const [re, to] of extraRules) t = t.replace(re, to);
  t = t
    .replace(/,\s*vilket (gav|ledde till|resulterade i)[^.]*\./gi, '.')
    .replace(/\b[Jj]ag tror att vi tillsammans kan\b/g, 'Tillsammans kan vi')
    .replace(/\btror jag att vi tillsammans kan\b/g, 'kan vi tillsammans')
    .replace(/\btror jag att vi kan\b/g, 'kan vi')
    .replace(/(^|[.!?]\s+)[Jj]ag tror att (\S)/g, (m, f, c) => f + c.toUpperCase());
  if (!isLast) t = t
    .replace(/\b([Jj]ag) ser fram emot att\b/g, '$1 vill')
    .replace(/\boch ser fram emot att\b/g, 'och vill')
    .replace(/\b([Ss]er) jag fram emot att\b/g, (m, s) => (s === 'Ser' ? 'Vill' : 'vill') + ' jag')
    .replace(/\bI look forward to\b/g, 'I would welcome');
  // At most one "ser fram emot", in the closing
  if (isLast) t = t.replace(/(ser fram emot[^.]*?)\s+och ser fram emot att\s+/i, '$1 och ');
  return sentences(t).filter(s => !DROP.test(s)).join(' ').replace(/^\w/, c => c.toUpperCase()).trim();
};

// ----- Claims the profile can't back up -----
// unknownTerms: systems, laws and tools not in the profile. A sentence claiming one is removed,
// unless it says the person does NOT have it.
const NEGATION = /(^|\s)(inte|INTE|aldrig|saknar|ingen|inga|not|never|no)(\s|[.,:]|$)/;
const termRe = t => new RegExp(`(^|[^\\wåäöÅÄÖ])${t.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&')}($|[^\\wåäöÅÄÖ])`);
const profileHas = sentences(b.profileFacts).flatMap(s => s.split('\n')).filter(s => !NEGATION.test(s)).join('\n');
const unknown = (C.unknownTerms || []).filter(t => !termRe(t).test(profileHas));
const removed = [];
const dropUnknownClaims = s => sentences(s).filter(m => {
  const hit = unknown.filter(t => termRe(t).test(m));
  if (hit.length && !NEGATION.test(m)) { removed.push(...hit); return false; }
  return true;
}).join(' ').trim();

// Missing skills: every sentence mentioning one is removed; the code's honest sentence replaces them.
const skillRes = (C.missingSkills?.items || []).map(s => ({ name: s.name, re: new RegExp(s.re, s.flags ?? '') }));
const missingRes = skillRes.filter(s => (b.missingSkills || []).includes(s.name)).map(s => s.re);
const dropMissing = t => !t ? t : sentences(t).filter(m => !missingRes.some(re => re.test(m))).join(' ');

// "glimt": an optional one-line dry joke. The prompt's examples must not be reused.
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
  const contribution = asList(parts.bidrag || parts.exempel);
  let glimt = clean(Array.isArray(parts.glimt) ? parts.glimt[0] : parts.glimt);
  if (glimt && EXAMPLES.some(e => resembles(glimt, e))) glimt = '';
  for (const f of ['inledning', 'matchning', 'utveckling', 'avslutning']) parts[f] = dropMissing(dropExamples(parts[f]));
  for (let i = 0; i < contribution.length; i++) contribution[i] = dropMissing(dropExamples(contribution[i]));
  if (glimt && contribution.length) contribution[contribution.length - 1] = `${contribution[contribution.length - 1]} ${glimt}`;
  else if (glimt) contribution.push(glimt);
  const matching = [honestSentence, parts.matchning].filter(Boolean).join(' ');

  const paragraphs = [
    parts.inledning,
    matching,
    ...contribution,
    parts.intresse || parts.motivation,
    parts.utveckling,
    parts.avslutning
  ].map(clean).filter(Boolean)
   .map((s, i, all) => unfill(s, i === all.length - 1))
   .map(dropUnknownClaims)
   .filter(Boolean);
  if (!paragraphs.length || !/ser fram emot|gärna|hör av|look forward|glad|happy to|welcome/i.test(paragraphs.at(-1))) {
    paragraphs.push(L.fallbackClosing);
  }
  tips = asList(parts.tips).map(clean).map(dropUnknownClaims).filter(Boolean).slice(0, 3);

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
