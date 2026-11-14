// Node: Code "Save car"
// Mode: Run Once for Each Item. Setting: Always Output Data = on.
// Empty row (no car trips today): nothing to save
let req = {};
try { req = $('Car trips').item.json || {}; } catch (e) {}
if (!req.key) return { json: {} };

let res = $json;
if (typeof res.data === 'string') {
  try { res = JSON.parse(res.data); } catch (e) { res = {}; }
}
const s = res.routes?.[0]?.summary || res.features?.[0]?.properties?.summary;

return { json: {
  key: req.key,
  carMin: s?.duration != null ? Math.round(s.duration / 60) : null,
  carKm: s?.distance != null ? Math.round(s.distance / 1000) : null
} };
