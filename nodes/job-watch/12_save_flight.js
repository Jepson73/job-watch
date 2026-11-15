// Node: Code "Save flight"
// Mode: Run Once for Each Item. Setting: Always Output Data = on.
// Fastest public transport trip from the destination airport to the job, plus the fixed minutes
// for getting there by air (jobs.travel.flight.fixedMinutes in the profile).
let req = {};
try { req = $('Flight trips').item.json || {}; } catch (e) {}
if (!req.key) return { json: {} };

let res = $json;
if (typeof res.data === 'string') {
  try { res = JSON.parse(res.data); } catch (e) { res = {}; }
}
const at = (d, t) => (d && t) ? new Date(`${d}T${t}`) : null;

let best = null;
for (const trip of [].concat(res.Trip || [])) {
  const legs = [].concat(trip.LegList?.Leg || []);
  const rides = legs.filter(l => l.type === 'JNY');
  if (!rides.length) continue;
  const a = at(rides[0].Origin?.date, rides[0].Origin?.time);              // first departure from the airport
  const b = at(legs.at(-1).Destination?.date, legs.at(-1).Destination?.time); // arrival at the job
  if (!a || !b) continue;
  const min = Math.round((b - a) / 60000);
  if (!best || min < best) best = min;
}

const FLIGHT_FIXED = Number(req.fixedMinutes) || 0;

return { json: {
  key: req.key,
  flightTransitMin: best,
  flightMin: best != null ? FLIGHT_FIXED + best : null
} };
