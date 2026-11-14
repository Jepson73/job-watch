// Node: Code "Select people"
// Mode: Run Once for All Items
// Receives every profile file and picks the people to run now.
// Scheduled run: only people whose sendHour is the current hour. Manual run: everyone (or testPerson).

const files = $input.all().map(i => i.json.data ?? i.json);
const global = files.find(f => f && f.global === true) || {};
const people = files.filter(f => f && f.id && f.active !== false && f.jobs);

let scheduled = false;
try { scheduled = $('Schedule Trigger').isExecuted; } catch (e) {}

const hour = $now.setZone(global.timezone || 'Europe/Stockholm').hour;

const selected = people.filter(p => scheduled
  ? (p.jobs.sendHour ?? 9) === hour
  : (!global.testPerson || global.testPerson === p.id));

return selected.map(p => ({ json: { ...p, global } }));
