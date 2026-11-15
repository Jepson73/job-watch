// Node: Code "Plan trips"
// Mode: Run Once for All Items
// Works out which travel times are needed (car, public transport, weekly commuting by air) for each
// person's jobs and skips those already in the cache. The same trip from the same home is only
// looked up once, even when two people live in the same place.
//
// Output: one row per trip to look up (type car/transit/flight), plus a final "__jobs__" row
// that carries every job and its cache keys on to "Attach travel times".

const people = Object.fromEntries($('Select people').all().map(i => [i.json.id, i.json]));
const sd = $getWorkflowStaticData('global');
const cache = sd.travelCache || {};
const now = Date.now();
const MAX_AGE = 60 * 24 * 3600 * 1000;   // 60 days

const pos = (lat, lon) => `${lat.toFixed(3)},${lon.toFixed(3)}`;
const hhmm = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const minutes = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const fresh = k => cache[k] && now - cache[k].at < MAX_AGE;
// Travel times are looked up for the next occurrence of jobs.travel.weekday (1 = Monday, the default)
const nextDay = wd => $now.plus({ days: ((wd - $now.weekday + 7) % 7) || 7 }).toFormat('yyyy-MM-dd');

const lookups = {};   // key -> lookup
const jobs = [];

for (const { json: j } of $input.all()) {
  const p = people[j.person];
  const travel = p.jobs.travel || {};
  const n = { ...j, keys: {} };
  jobs.push(n);
  if (j.lat == null || j.nationwide) continue;   // no place, or nationwide: no travel time needed

  const home = pos(p.home.lat, p.home.lon);
  const dest = pos(j.lat, j.lon);
  const weekday = travel.weekday ?? 1;
  const day = weekday === 1 ? '' : `|W${weekday}`;   // keeps cache keys unchanged for Monday
  const base = { homeLat: p.home.lat, homeLon: p.home.lon, lat: j.lat, lon: j.lon, date: nextDay(weekday) };

  if (travel.car) {
    const k = `car|${home}|${dest}${day}`;
    n.keys.car = k;
    if (!fresh(k)) lookups[k] ??= { type: 'car', key: k, ...base };
  }

  const t = travel.transit;
  if (t) {
    let time, arrive = false;
    if (t.mode === 'arrive') {
      // Arrive a little before the working day starts: from the ad if it states hours, otherwise the default
      const fromAd = !!(t.fromAd && j.startTime);
      const start = fromAd ? j.startTime : (t.time || '07:00');
      time = hhmm(minutes(start) - (t.marginMin ?? 10));
      arrive = true;
      n.workStart = start;
      n.workStartSource = fromAd ? 'ad' : 'default';
    } else {
      time = t.time || '06:00';
    }
    const k = `transit|${home}|${dest}|${arrive ? 'A' : 'D'}${time.replace(':', '')}${day}`;
    n.keys.transit = k;
    n.transitTime = time;
    n.transitByArrival = arrive;
    if (!fresh(k)) lookups[k] ??= { type: 'transit', key: k, time, arrive: arrive ? '1' : '0', ...base };
  }

  // Flight: public transport from the airport's station to the job, plus fixed minutes for the flight itself
  const f = travel.flight;
  if (f && j.flightCandidate) {
    const from = f.trainFrom || f.airport;
    const k = `flight|${pos(from.lat, from.lon)}|${dest}${day}`;
    n.keys.flight = k;
    if (!fresh(k)) lookups[k] ??= { type: 'flight', key: k, ...base,
      fromLat: from.lat, fromLon: from.lon, time: f.departAt || '07:00', fixedMinutes: f.fixedMinutes ?? 0 };
  }
}

return [
  ...Object.values(lookups).map(l => ({ json: l })),
  { json: { type: '__jobs__', jobs } }
];
