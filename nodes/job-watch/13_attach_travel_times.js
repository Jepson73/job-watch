// Node: Code "Attach travel times"
// Mode: Run Once for All Items
// Collects new travel times from the three lanes, caches the successful ones and puts travel times on every job.

const sd = $getWorkflowStaticData('global');
const cache = sd.travelCache || {};
const now = Date.now();
const MAX_AGE = 60 * 24 * 3600 * 1000;

const collect = node => { try { return $(node).all().map(i => i.json).filter(r => r.key); } catch (e) { return []; } };
const results = [
  ...collect('Save car').filter(r => r.carMin != null),
  ...collect('Save transit').filter(r => r.transitMin != null),
  ...collect('Save flight').filter(r => r.flightMin != null),
];
for (const r of results) {
  const { key, ...values } = r;
  cache[key] = { ...values, at: now };
}
for (const k of Object.keys(cache)) if (now - cache[k].at > MAX_AGE) delete cache[k];
sd.travelCache = cache;

const jobs = $('Plan trips').all().find(i => i.json.type === '__jobs__')?.json.jobs || [];
return jobs.map(j => {
  const travel = {};
  for (const k of Object.values(j.keys || {})) {
    if (!cache[k]) continue;
    const { at, ...rest } = cache[k];
    Object.assign(travel, rest);
  }
  const { keys, ...rest } = j;
  return { json: {
    carMin: null, carKm: null, transitMin: null, transitChanges: null, transitWalkMin: null, transitArrive: null,
    flightTransitMin: null, flightMin: null,
    ...rest, ...travel
  } };
});
