// Node: Code "Transit trips"
// Mode: Run Once for All Items. Setting: Always Output Data = on.
const rows = $('Plan trips').all().filter(i => i.json.type === 'transit');
return rows.map(i => ({ json: i.json }));
