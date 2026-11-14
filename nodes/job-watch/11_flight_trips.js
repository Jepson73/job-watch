// Node: Code "Flight trips"
// Mode: Run Once for All Items. Setting: Always Output Data = on.
const rows = $('Plan trips').all().filter(i => i.json.type === 'flight');
return rows.map(i => ({ json: i.json }));
