// Node: Code "Filter ads"
// Mode: Run Once for All Items
// Goes through every search hit and keeps the ads that suit each person.
// All rules live in the profile under jobs.filter, so this code is the same for everyone.
// Regexes match Swedish ad text, so they stay in Swedish in the profiles.

const people = Object.fromEntries($('Select people').all().map(i => [i.json.id, i.json]));
const searchRows = $('Build searches').all();
const sd = $getWorkflowStaticData('global');

const ARN = { lat: 59.6519, lon: 17.9186 };   // Stockholm Arlanda airport
const MAX_FROM_ARN = 120;                     // km from Arlanda for the flight option

const RE = s => (s ? new RegExp(s, 'i') : null);
const rad = d => d * Math.PI / 180;
const km = (a, b) => {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)));
};

// Working hours in the ad, e.g. "kl. 7-16", "arbetstid 07.00–16.00" or "dagtid 9-17".
// Requires a time-related word nearby, so years and salaries are not mistaken for hours.
const WORKING_HOURS = /(?:\bkl\.?|klockan|arbetstid\w*|arbetstider|dagtid|tider|schema|pass\w*|mellan)[^.\n]{0,25}?\b(0?[5-9]|10)(?:[.:]([0-5]\d))?\s*(?:-|–|—|till)\s*(1[2-9]|2[0-3])(?:[.:]([0-5]\d))?\b/gi;
const earliestStart = text => {
  let earliest = null;
  for (const m of text.matchAll(WORKING_HOURS)) {
    const min = Number(m[1]) * 60 + Number(m[2] || 0);
    if (earliest == null || min < earliest) earliest = min;
  }
  return earliest == null ? null
    : `${String(Math.floor(earliest / 60)).padStart(2, '0')}:${String(earliest % 60).padStart(2, '0')}`;
};

// Compile each person's rules once
const cache = {};
const rules = p => cache[p.id] ??= (() => {
  const f = p.jobs.filter || {};
  return {
    areas: (f.areas || []).map(a => ({ label: a.label, re: RE(a.re) })),
    remote: RE(f.remoteRe),
    rejectTitle: RE(f.rejectTitleRe),
    staffing: RE(f.staffingRe),
    viaClient: RE(f.viaClientRe),
    licenceRequired: f.noDrivingLicence ? RE(f.licenceRequiredRe) : null,
    licenceMerit: RE(f.licenceMeritRe),
    degreeRequired: RE(f.degreeRequiredRe),
    degreeMerit: RE(f.degreeMeritRe),
    rejectEmployment: RE(f.rejectEmploymentRe),
    occupation: f.occupation ? { fields: f.occupation.allowedFields || [], re: RE(f.occupation.occupationRe) } : null,
    maxKm: f.maxDistanceKm ?? 400,
    flight: !!p.jobs.travel?.flightViaArlanda,
    nationwideMinKm: p.jobs.search?.nationwide?.minKm ?? 200,
    parseHours: p.jobs.travel?.transit?.mode === 'arrive' && p.jobs.travel.transit.fromAd,
  };
})();

// Right occupation: JobTech tags each ad with an occupation and an occupation field.
// If neither is set, the ad is kept.
const rightOccupation = (r, h) => {
  if (!r.occupation) return true;
  const occ = h.occupation?.label || '';
  const field = h.occupation_field?.label || '';
  if (!occ && !field) return true;
  if (r.occupation.fields.includes(field)) return true;
  return r.occupation.re ? r.occupation.re.test(`${occ} ${h.headline || ''}`) : false;
};

const seen = {};      // person -> Set of ads seen in earlier runs
const thisRun = {};   // person -> Set of ads seen in this run
const jobs = [];

for (const [idx, item] of $input.all().entries()) {
  let search;
  try { search = $('Build searches').itemMatching(idx).json; } catch (e) { search = searchRows[idx]?.json; }
  const p = search && people[search.person];
  if (!p) continue;
  const r = rules(p);
  seen[p.id] ??= new Set(sd.seen?.[p.id] || []);
  thisRun[p.id] ??= new Set();

  for (const h of (item.json.hits || [])) {
    const id = String(h.id);
    if (thisRun[p.id].has(id) || seen[p.id].has(id)) continue;
    thisRun[p.id].add(id);

    const description = h.description?.text || '';
    const text = `${h.headline || ''} ${description}`;

    if (!rightOccupation(r, h)) continue;
    const areas = r.areas.filter(a => a.re.test(text)).map(a => a.label);
    const remote = r.remote ? (h.remote_work === true || r.remote.test(text)) : false;
    if (!areas.length && !remote) continue;
    if (r.rejectTitle?.test(h.headline || '')) continue;

    // Required degree the person doesn't have. Sentences where it is only a merit don't count.
    if (r.degreeRequired && description.split(/(?<=[.!?\n])\s+/)
      .some(s => r.degreeRequired.test(s) && !(r.degreeMerit?.test(s)))) continue;

    // Driving licence
    if (r.licenceRequired && (h.driving_license_required === true || r.licenceRequired.test(text))) continue;
    const licenceMerit = r.licenceMerit ? r.licenceMerit.test(text) : false;

    // Employment form
    if (r.rejectEmployment?.test(`${h.employment_type?.label || ''} ${h.headline || ''}`)) continue;
    const workingHours = h.working_hours_type?.label || '';

    // Location and distance
    const c = h.workplace_address?.coordinates || [];
    let place = null;
    if (c.length === 2 && c[0] != null && c[1] != null) {
      place = c[0] > 50 ? { lat: c[0], lon: c[1] } : { lat: c[1], lon: c[0] };
    }
    const distanceKm = place ? km(p.home, place) : null;
    let nationwide = false, flightCandidate = false, tooFar = false;
    if (search.nationwide) {
      // From the nationwide searches: only ads with a known place far away. Closer jobs come from the local searches.
      if (!place || distanceKm < r.nationwideMinKm) continue;
      nationwide = true;
    } else if (place) {
      flightCandidate = r.flight && km(ARN, place) <= MAX_FROM_ARN;
      tooFar = distanceKm > r.maxKm && !flightCandidate;
      if (tooFar && !remote) continue;
    }

    // Employer type, from the Swedish organisation number prefix
    const org = String(h.employer?.organization_number || '').replace(/\D/g, '');
    const name = (h.employer?.name || '').toLowerCase();
    const viaClient = r.viaClient ? r.viaClient.test(text) : false;
    const staffing = (r.staffing ? r.staffing.test(name) : false) || viaClient;
    let employerType;
    if (org.startsWith('2120')) employerType = 'municipality';
    else if (org.startsWith('2220')) employerType = 'municipalFederation';
    else if (org.startsWith('2320') || org.startsWith('2321')) employerType = 'region';
    else if (org.startsWith('2021')) employerType = 'agency';
    else if (staffing) employerType = 'staffing';
    else employerType = 'private';

    // Salary counts as stated if the salary field or the text contains an amount
    const salaryText = `${h.salary_description || ''}`;
    const salaryStated = /\d[\d\s]{3,}\s?(kr|sek|:-)/i.test(`${salaryText} ${description}`);

    jobs.push({
      person: p.id,
      id,
      title: h.headline,
      employer: h.employer?.name || '',
      employerType,
      staffing: employerType === 'staffing',
      areas,
      remote,
      workingHours,
      licenceMerit,
      experienceRequired: h.experience_required === true,
      salaryStated,
      salaryText,
      startTime: r.parseHours ? earliestStart(description) : null,
      town: h.workplace_address?.municipality || h.workplace_address?.city || '',
      published: (h.publication_date || '').slice(0, 10),
      deadline: (h.application_deadline || '').slice(0, 10),
      url: h.webpage_url,
      // Far away but remote: no travel time needed
      lat: tooFar ? null : (place?.lat ?? null),
      lon: tooFar ? null : (place?.lon ?? null),
      distanceKm,
      nationwide,
      flightCandidate: tooFar ? false : flightCandidate,
      description: description.slice(0, 4000)
    });
  }
}

return jobs.map(j => ({ json: j }));
