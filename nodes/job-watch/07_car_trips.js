// Node: Code "Car trips"
// Mode: Run Once for All Items. Setting: Always Output Data = on, so the flow continues with no car trips.
const rows = $('Plan trips').all().filter(i => i.json.type === 'car');
return rows.map(i => ({ json: i.json }));
