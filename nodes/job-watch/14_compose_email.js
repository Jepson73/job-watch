// Node: Code "Compose email"
// Mode: Run Once for All Items
// Builds one email per person. Groups, texts and what is shown come from jobs.email in the profile.
// The fixed wording of the email is in STRINGS below (Swedish by default). Override any of it
// with "strings" in _global.json (everyone) or in jobs.email.strings (one person).

const STRINGS = {
  locale: 'sv',
  defaultSubject: 'Nya jobb',
  defaultHeading: 'Nya jobb ({count} st)',
  why: 'Varför',
  published: 'Publicerad',
  deadline: 'Sista ansökningsdag',
  notStated: 'ej angiven',
  unknown: 'okänd',
  unknownTown: 'okänd ort',
  hours: 'h',
  minutes: 'min',
  points: 'p',
  car: 'Bil',
  transit: 'Tåg/buss',
  direct: 'direkt',
  change: 'byte',
  changes: 'byten',
  walkPart: 'varav {min} min gång',
  arrives: 'framme {time}',
  flight: 'Flyg via {label} ca {time}',
  workStartsAd: 'Arbetet börjar {time} enligt annonsen',
  workStartsDefault: 'Annonsen anger ingen arbetstid, räknat med start {time}',
  remoteNoTravel: 'Distans eller hybrid, restid ej beräknad',
  unknownTravel: 'Restid okänd, kolla i reseplaneraren',
  nationwideTravel: '{km} km fågelväg, utanför dagpendling (kräver flytt eller veckopendling)',
  routePlanner: 'Reseplanerare',
  findHousing: 'Sök boende i {town}',
  housingQuery: 'övernattningslägenhet möblerad lägenhet korttid',
  coverLetter: 'Skriv utkast till personligt brev',
  sameAdIn: 'Samma annons på {n} orter:',
  flightNote: 'Kräver något senare start på måndagar, eller flyg söndag kväll om det finns.',
  deadlineToday: 'Sista dag i dag',
  deadlineIn: 'Sista dag om {n} {days}',
  day: 'dag',
  days: 'dagar',
  noLocationGroup: 'Plats saknas',
  nationwideGroup: 'Längre bort i landet',
  employerTypes: {
    municipality: 'Kommun',
    municipalFederation: 'Kommunalförbund',
    region: 'Region',
    agency: 'Myndighet',
    staffing: 'Bemanning/konsult',
    private: 'Privat arbetsgivare'
  }
};

const people = Object.fromEntries($('Select people').all().map(i => [i.json.id, i.json]));
const sd = $getWorkflowStaticData('global');
sd.seen ??= {};
sd.thoughts ??= {};

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const enc = encodeURIComponent;
const fill = (template, v) => String(template || '').replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
const tag = (text, colour) =>
  `<span style="background:${colour};padding:1px 6px;border-radius:4px;font-size:12px;margin-right:4px">${esc(text)}</span>`;

const byPerson = {};
for (const { json: j } of $input.all()) (byPerson[j.person] ??= []).push(j);

const out = [];
for (const [id, jobs] of Object.entries(byPerson)) {
  const p = people[id];
  const E = p.jobs.email || {};
  const G = p.global || {};
  const S = { ...STRINGS, ...(G.strings || {}), ...(E.strings || {}),
    employerTypes: { ...STRINGS.employerTypes, ...(G.strings?.employerTypes || {}), ...(E.strings?.employerTypes || {}) } };
  const flightLabel = p.jobs.travel?.flight?.label || '';
  const duration = m => m == null ? S.unknown
    : (m < 60 ? `${m} ${S.minutes}` : `${Math.floor(m / 60)} ${S.hours} ${String(m % 60).padStart(2, '0')} ${S.minutes}`);

  const groups = E.groups || [];
  const REMOTE = E.remoteGroup || null;
  const FLIGHT = E.flightGroup || null;
  const NO_LOCATION = E.noLocationGroup || S.noLocationGroup;
  const NATIONWIDE = E.nationwideGroup || S.nationwideGroup;
  const ORDER = [...(REMOTE ? [REMOTE] : []), ...groups.map(g => g.name), ...(FLIGHT ? [FLIGHT.name] : []), NO_LOCATION, NATIONWIDE];
  const HOME = `${p.home.lat},${p.home.lon}`;

  // ===== Sort into groups =====
  for (const j of jobs) {
    const times = E.travelTimeBy === 'transit'
      ? [j.transitMin].filter(v => v != null)
      : [j.carMin, j.transitMin].filter(v => v != null);
    j.fastest = times.length ? Math.min(...times) : null;
    const g = groups.find(g => j.fastest != null && j.fastest <= g.max);
    if (j.nationwide) j.group = NATIONWIDE;
    else if (REMOTE && j.remote) j.group = REMOTE;
    else if (g) j.group = g.name;
    else if (FLIGHT && j.flightMin != null && j.flightMin <= FLIGHT.max) j.group = FLIGHT.name;
    else if (j.lat == null || j.fastest == null) j.group = NO_LOCATION;
    else j.group = null;   // too far away
    j.travelMin = (FLIGHT && j.group === FLIGHT.name) ? j.flightMin : j.fastest;
  }
  const included = jobs.filter(j => j.group);

  // ===== Merge the same position advertised in several towns =====
  const list = [];
  const index = {};
  for (const j of included) {
    const key = `${j.nationwide ? 'N' : ''}${j.employer}|${(j.title || '').split(j.town || '\u0000').join('')}`
      .toLowerCase().replace(/[^a-zåäö0-9|]/g, '');
    if (!index[key]) { index[key] = { ...j, towns: [] }; list.push(index[key]); }
    const s = index[key];
    s.towns.push({ town: j.town || S.unknownTown, travelMin: j.travelMin, url: j.url });
    const better = ORDER.indexOf(j.group) < ORDER.indexOf(s.group) ||
      (j.group === s.group && (j.travelMin ?? 9999) < (s.travelMin ?? 9999));
    if (better) Object.assign(s, { ...j, towns: s.towns });
    if (j.published > s.published) s.published = j.published;
  }
  list.sort((a, b) =>
    ORDER.indexOf(a.group) - ORDER.indexOf(b.group) ||
    (b.score ?? 0) - (a.score ?? 0) ||
    b.published.localeCompare(a.published));

  // Every processed ad counts as seen
  sd.seen[id] = [...(sd.seen[id] || []), ...jobs.map(j => j.id)].slice(-5000);
  if (!list.length) continue;   // no new jobs = no email

  // ===== One row in the email =====
  const row = j => {
    let trip;
    if (j.nationwide) {
      trip = fill(S.nationwideTravel, { km: j.distanceKm });
    } else {
      const transit = j.transitMin != null
        ? `${E.transitLabel || S.transit} ${duration(j.transitMin)}`
          + (j.transitChanges != null
            ? ` (${j.transitChanges === 0 ? S.direct : `${j.transitChanges} ${j.transitChanges === 1 ? S.change : S.changes}`}${j.transitWalkMin ? `, ${fill(S.walkPart, { min: j.transitWalkMin })}` : ''})`
            : '')
          + (j.transitArrive && j.workStart ? `, ${fill(S.arrives, { time: j.transitArrive })}` : '')
        : null;
      trip = [
        (E.travelTimeBy !== 'transit' && j.carMin != null) ? `${S.car} ${duration(j.carMin)}` : null,
        transit,
        j.flightMin != null ? fill(S.flight, { time: duration(j.flightMin), label: flightLabel }) : null,
      ].filter(Boolean).join(' · ')
        || (j.remote ? S.remoteNoTravel : S.unknownTravel);
      if (j.workStart) {
        trip += `<br><span style="font-size:12px;color:#555">${esc(fill(
          j.workStartSource === 'ad' ? S.workStartsAd : S.workStartsDefault, { time: j.workStart }))}</span>`;
      }
    }

    const map = j.lat != null && !j.nationwide
      ? `https://www.google.com/maps/dir/?api=1&origin=${HOME}&destination=${j.lat},${j.lon}&travelmode=transit` : null;
    // Groups with "housingLink": true get a link to search for short-term housing
    const groupConf = groups.find(g => g.name === j.group) || (FLIGHT && FLIGHT.name === j.group ? FLIGHT : null);
    const housing = groupConf?.housingLink
      ? `https://www.google.com/search?q=${enc(`${S.housingQuery} ${j.town}`)}` : null;
    const flightNote = FLIGHT && j.group === FLIGHT.name
      ? `<span style="color:#a15c00;font-size:12px">${esc(S.flightNote)}</span><br>` : '';
    const shown = new Set();
    const towns = (j.towns || [])
      .sort((a, b) => (a.travelMin ?? 9999) - (b.travelMin ?? 9999))
      .filter(t => !shown.has(t.town) && shown.add(t.town));
    const severalTowns = towns.length > 1
      ? `<span style="font-size:12px;color:#555">${esc(fill(S.sameAdIn, { n: towns.length }))} ${
          towns.map(t => `<a href="${esc(t.url)}">${esc(t.town)}</a> (${duration(t.travelMin)})`).join(', ')
        }</span><br>` : '';

    const daysLeft = (E.deadlineWarningDays != null && j.deadline)
      ? Math.ceil((new Date(j.deadline) - new Date($now.toISODate())) / 86400000) : null;
    const soon = daysLeft != null && daysLeft >= 0 && daysLeft <= E.deadlineWarningDays;
    const tags = [
      soon ? tag(daysLeft === 0 ? S.deadlineToday : fill(S.deadlineIn, { n: daysLeft, days: daysLeft === 1 ? S.day : S.days }), '#fde2e1') : '',
      ...(j.areas || []).map(a => tag(a, '#e6eef8')),
      (E.showWorkingHours && j.workingHours) ? tag(j.workingHours, '#f1ece2') : '',
      ...(j.labels || []).map(l => tag(l, '#e3f2e3')),
    ].join('');

    // Link to the cover letter form, prefilled with the ad and the person (hidden field)
    const letter = E.coverLetterForm
      ? `${G.formBaseUrl || ''}${E.coverLetterForm}?annons_id=${enc(j.id)}&tjanst=${enc(`${j.title}, ${j.employer}`)}&person=${enc(id)}`
      : null;

    return `<tr><td style="padding:10px 4px;border-bottom:1px solid #ddd;font-family:Arial,sans-serif;font-size:14px">
    <a href="${esc(j.url)}" style="font-size:15px"><b>${esc(j.title)}</b></a>
    <span style="color:#888;font-size:12px"> · ${j.score ?? 0} ${S.points}</span><br>
    ${tags ? tags + '<br>' : ''}
    ${esc(j.employer)}${E.showEmployerType ? ` · <i>${esc(S.employerTypes[j.employerType] || j.employerType)}</i>` : ''} · ${esc(j.town || S.unknownTown)}<br>
    ${j.reasons ? `<span style="color:#176b70;font-size:13px">${esc(S.why)}: ${esc(j.reasons)}</span><br>` : ''}
    <span style="color:#555">${esc(S.published)} ${esc(j.published)} · ${esc(S.deadline)} ${esc(j.deadline || S.notStated)}</span><br>
    ${trip}<br>
    ${severalTowns}
    ${flightNote}
    ${[map ? `<a href="${map}">${esc(S.routePlanner)}</a>` : '',
       housing ? `<a href="${housing}">${esc(fill(S.findHousing, { town: j.town }))}</a>` : '',
       letter ? `<a href="${letter}"><b>${esc(S.coverLetter)}</b></a>` : ''].filter(Boolean).join(' · ')}
  </td></tr>`;
  };

  // ===== The email =====
  const v = { count: list.length, name: p.name || id };
  let html = `<div style="font-family:Arial,sans-serif;max-width:700px">
  <h2>${esc(fill(E.heading || S.defaultHeading, v))}</h2>
  ${E.intro ? `<p style="color:#555;font-size:13px">${esc(fill(E.intro, v))}</p>` : ''}`;
  if (E.noneNearbyText && !list.some(j => j.group !== NATIONWIDE)) {
    html += `<p style="font-size:14px"><b>${esc(E.noneNearbyText)}</b></p>`;
  }
  for (const g of ORDER) {
    const inGroup = list.filter(j => j.group === g);
    if (!inGroup.length) continue;
    html += `<h3 style="margin-top:24px">${esc(g)} (${inGroup.length})</h3><table style="width:100%;border-collapse:collapse">`;
    html += inGroup.map(row).join('') + '</table>';
  }
  if (E.footer) html += `<p style="color:#888;font-size:12px;margin-top:24px">${esc(fill(E.footer, v))}</p>`;
  html += '</div>';

  // ===== Daily thought: the prompt is built here, the model writes it in the next node =====
  const T = p.jobs.thought || {};
  const themes = T.themes?.length ? T.themes : ['small steps forward'];
  const theme = themes[$now.ordinal % themes.length];
  const earlier = (sd.thoughts[id] || []).slice(-10).join('\n');
  const thoughtPrompt = T.prompt ? fill(T.prompt, { theme, earlier }) : '';

  // Test mode: everything goes to testTo instead of the person
  const test = !!G.testTo;
  out.push({ json: {
    person: id,
    subject: `${test ? `[TEST ${id}] ` : ''}${E.subject || S.defaultSubject} ${$now.setLocale(S.locale).toFormat('d LLLL')}: ${list.length} st`,
    html,
    count: list.length,
    thoughtPrompt: thoughtPrompt || 'Reply with an empty answer.',
    hasThought: !!thoughtPrompt,
    from: G.from,
    to: test ? G.testTo : p.email?.to,
    bcc: test ? '' : (p.email?.bcc || '')
  } });
}
return out;
