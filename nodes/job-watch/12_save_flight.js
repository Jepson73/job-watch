// Node: Code "Save flight"
// Mode: Run Once for Each Item. Setting: Always Output Data = on.
// Fastest public transport trip from Arlanda to the job, plus a fixed time for the flight there.
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
  const a = at(rides[0].Origin?.date, rides[0].Origin?.time);              // first departure from Arlanda
  const b = at(legs.at(-1).Destination?.date, legs.at(-1).Destination?.time); // arrival at the job
  if (!a || !b) continue;
  const min = Math.round((b - a) / 60000);
  if (!best || min < best) best = min;
}

// Home to airport 30 + margin 30 + flight 80 + out of Arlanda to the train 15
const FLIGHT_FIXED = 30 + 30 + 80 + 15;

return { json: {
  key: req.key,
  flightTransitMin: best,
  flightMin: best != null ? FLIGHT_FIXED + best : null
} };
