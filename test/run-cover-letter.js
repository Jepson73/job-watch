// Runs the "Cover letter" workflow with a mock n8n runtime: a form submission, a made-up ad and a
// made-up model answer. Writes the email and the Word file to test/results/.
//
//   node test/run-cover-letter.js [person] [case]
//   PEOPLE_DIR=/path/to/people node test/run-cover-letter.js <id>
const fs = require('fs');
const path = require('path');

const WF = JSON.parse(fs.readFileSync(path.join(__dirname, '../out/cover-letter.json'), 'utf8'));
const NODE = Object.fromEntries(WF.nodes.map(n => [n.name, n]));
const CASES = require(process.env.CASES_FILE || './cover-letter-cases.js');

// Minimal runtime: every Code node here runs once for all items, so $('X').first() is all we need.
async function runCode(name, input, out) {
  const $ = n => {
    if (!out[n]) throw new Error(`Node ${n} has not run`);
    return { first: () => out[n][0], all: () => out[n], item: out[n][0] };
  };
  const fn = new Function('$input', '$', '$json', `return (async () => {${NODE[name].parameters.jsCode}\n})();`);
  const res = await fn({ all: () => input, first: () => input[0] }, $, input[0]?.json);
  return res.map(r => ({ json: r.json, binary: r.binary }));
}

async function run(peopleDir, person, c) {
  const out = {};
  out['Cover letter form'] = [{ json: { person, annons_id: c.ad.id, tjanst: c.ad.headline, motivering: c.motivation || '' } }];
  out['Read profiles'] = fs.readdirSync(peopleDir).filter(f => f.endsWith('.json')).map(f => ({ json: {}, file: f }));
  out['Parse profiles'] = out['Read profiles'].map(i => ({ json: { data: JSON.parse(fs.readFileSync(path.join(peopleDir, i.file), 'utf8')) } }));
  out['Select person'] = await runCode('Select person', out['Parse profiles'], out);
  out['Fetch ad'] = [{ json: c.ad }];
  out['Prepare ad'] = await runCode('Prepare ad', out['Fetch ad'], out);
  out['Build profile'] = await runCode('Build profile', out['Prepare ad'], out);
  out['Write letter'] = [{ json: { text: typeof c.answer === 'string' ? c.answer : JSON.stringify(c.answer) } }];
  out['Build email'] = await runCode('Build email', out['Write letter'], out);
  out['Create Word file'] = await runCode('Create Word file', out['Build email'], out);
  return out;
}
module.exports = { run };

if (require.main === module) {
  (async () => {
    const peopleDir = process.env.PEOPLE_DIR || path.join(__dirname, '../config.example');
    const person = process.argv[2] || 'example';
    const only = process.argv[3];
    const dir = path.join(__dirname, 'results');
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, c] of Object.entries(CASES)) {
      if (only && name !== only) continue;
      const out = await run(peopleDir, person, c);
      const e = out['Create Word file'][0];
      const b = out['Build profile'][0].json;
      fs.writeFileSync(path.join(dir, `letter-${person}-${name}.html`), `<!-- to: ${e.json.to} subject: ${e.json.subject} -->\n${e.json.html}`);
      if (e.binary) fs.writeFileSync(path.join(dir, `letter-${person}-${name}.docx`), Buffer.from(e.binary.data.data, 'base64'));
      console.log(`${name.padEnd(14)} lang=${b.language} outOfField=${b.outOfField} gaps=[${b.gaps.join('; ')}] missing=[${b.missingSkills.join(', ')}]`);
      console.log(`${''.padEnd(14)} ${e.json.subject} -> ${e.json.to}`);
      for (const p of (e.json.letter?.paragraphs || [])) console.log(`${''.padEnd(14)} | ${p}`);
    }
  })().catch(e => { console.error(e); process.exit(1); });
}
