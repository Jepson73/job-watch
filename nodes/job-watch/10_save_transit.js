// Node: Code "Save transit"
// Mode: Run Once for Each Item. Setting: Always Output Data = on.
// Fastest trip door to door, including all walking.
let req = {};
try { req = $('Transit trips').item.json || {}; } catch (e) {}
if (!req.key) return { json: {} };

let res = $json;
if (typeof res.data === 'string') {
  try { res = JSON.parse(res.data); } catch (e) { res = {}; }
}
const at = (d, t) => (d && t) ? new Date(`${d}T${t}`) : null;
const legMinutes = l => {
  const a = at(l.Origin?.date, l.Origin?.time);
  const b = at(l.Destination?.date, l.Destination?.time);
  return (a && b) ? Math.round((b - a) / 60000) : 0;
};

let best = null;
for (const trip of [].concat(res.Trip || [])) {
  const legs = [].concat(trip.LegList?.Leg || []);
  const rides = legs.filter(l => l.type === 'JNY');
  if (!rides.length) continue;
  const a = at(legs[0].Origin?.date, legs[0].Origin?.time);
  const b = at(legs.at(-1).Destination?.date, legs.at(-1).Destination?.time);
  if (!a || !b) continue;
  const min = Math.round((b - a) / 60000);
  const walk = legs.filter(l => l.type !== 'JNY').reduce((s, l) => s + legMinutes(l), 0);
  if (!best || min < best.min) {
    best = { min, changes: rides.length - 1, walk,
      depart: String(legs[0].Origin?.time || '').slice(0, 5),
      arrive: String(legs.at(-1).Destination?.time || '').slice(0, 5) };
  }
}

return { json: {
  key: req.key,
  transitMin: best?.min ?? null,
  transitChanges: best?.changes ?? null,
  transitWalkMin: best?.walk ?? null,
  transitDepart: best?.depart ?? null,
  transitArrive: best?.arrive ?? null,
  transitError: best ? null : (res.errorText || res.error?.message || 'no trip found')
} };
