// Runs the "Job watch" workflow node by node with a mock n8n runtime and mock APIs.
// The code is read from the built JSON file, so exactly that is what gets tested.
const fs = require('fs');
const path = require('path');
const { DateTime } = require('luxon');

const WF = JSON.parse(fs.readFileSync(path.join(__dirname, '../out/job-watch-no-state.json'), 'utf8'));
const NOD = Object.fromEntries(WF.nodes.map(n => [n.name, n]));
const ADS = require(process.env.ADS_FILE || './ads.js');

// ---------- Mock n8n ----------
const out = {};           // node name -> items [{ json, pairedItem }]
const parent = {};        // node name -> parent node
const staticData = { global: {} };
const ran = new Set();
const NOW = DateTime.fromISO('2026-11-16T09:00:00', { zone: 'Europe/Stockholm' });
const SCHEDULED = process.env.SCHEDULED === '1';

function trace(from, target, idx) {
  // Follow pairedItem back from (from, idx) until target is reached
  let node = from, i = idx;
  while (node !== target) {
    const it = out[node][i];
    if (!it || it.pairedItem == null) throw new Error(`Paired item saknas: ${node}[${i}] -> ${target}`);
    i = it.pairedItem.item; node = parent[node];
    if (!node) throw new Error(`Cannot find ${target} upstream`);
  }
  return out[node][i];
}

function makeDollar(current, currentIdx) {
  return name => {
    if (name === 'Schedule Trigger') return { isExecuted: SCHEDULED };
    if (!out[name]) throw new Error(`Node ${name} has not run`);
    return {
      all: () => out[name],
      first: () => out[name][0],
      isExecuted: ran.has(name),
      itemMatching: i => traceFromInput(current, i, name),
      get item() { return traceFromInput(current, currentIdx, name); },
    };
  };
}
// From the current node's INPUT row i (= the parent's output row i)
function traceFromInput(current, i, target) {
  const p = parent[current];
  if (p === target) return out[p][i];
  return trace(p, target, i);
}

function runCode(name, input) {
  const n = NOD[name];
  const perItem = n.parameters.mode === 'runOnceForEachItem';
  const fn = new Function('$input', '$', '$json', '$now', '$getWorkflowStaticData', `return (async () => {${n.parameters.jsCode}\n})();`);
  const sd = () => staticData.global;
  let res;
  if (perItem) {
    res = [];
    return Promise.all(input.map(async (it, i) => {
      const r = await fn({ all: () => input, first: () => input[0], item: it }, makeDollar(name, i), it.json, NOW, sd);
      return { json: r.json, pairedItem: { item: i } };
    })).then(r => r);
  }
  return fn({ all: () => input, first: () => input[0] }, makeDollar(name, 0), input[0]?.json, NOW, sd).then(r => {
    const arr = (r || []).map((x, i) => ({ json: x.json, pairedItem: x.pairedItem ?? (r.length === input.length ? { item: i } : { item: 0 }) }));
    if (!arr.length && n.alwaysOutputData) return [{ json: {}, pairedItem: { item: 0 } }];
    return arr;
  });
}

// ---------- Mock APIs ----------
const rad = d => d * Math.PI / 180;
const km = (a, b) => {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};
const calls = { jobtech: [], ors: 0, resrobot: [], arlanda: 0, embed: 0 };

function jobtech(url) {
  calls.jobtech.push(decodeURIComponent(url));
  const u = new URL(url);
  const q = (u.searchParams.get('q') || '').toLowerCase().replace(/"/g, '');
  const words = q.split(/\s+/).filter(Boolean);
  const pos = u.searchParams.get('position');
  const radius = Number(u.searchParams.get('position.radius') || 0);
  const remote = u.searchParams.get('remote') === 'true';
  let hits = ADS.filter(a => {
    const t = `${a.headline} ${a.description.text}`.toLowerCase();
    if (!words.some(o => t.includes(o))) return false;
    if (remote && !a.remote_work) return false;
    if (pos) {
      const [lat, lon] = pos.split(',').map(Number);
      const [alon, alat] = a.workplace_address.coordinates;
      if (km({ lat, lon }, { lat: alat, lon: alon }) > radius) return false;
    }
    return true;
  });
  // Pretend "lagermedarbetare" returns two pages (tests that pagination keeps the right person)
  if (q === 'dataanalytiker' && hits.length > 1) return [{ hits: hits.slice(0, 1) }, { hits: hits.slice(1) }];
  return [{ hits }];
}
function ors(j) {
  calls.ors++;
  if (j.homeLat == null) return { error: 'Bad request' };
  const d = km({ lat: j.homeLat, lon: j.homeLon }, { lat: j.lat, lon: j.lon }) * 1.25;
  return { routes: [{ summary: { duration: d / 80 * 3600, distance: d * 1000 } }] };
}
function resrobot(j, from) {
  const a = from || { lat: j.homeLat, lon: j.homeLon };
  if (a.lat == null) return { errorText: 'Bad request' };
  from ? calls.arlanda++ : calls.resrobot.push(`${j.time} ${j.arrive === '1' ? 'arrive' : 'depart'}`);
  const min = Math.round(15 + km(a, j) * 0.9);
  const date = '2026-11-23';
  const mk = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  const [th, tm] = (j.time || '07:00').split(':').map(Number);
  let start = th * 60 + tm, end = start + min;
  if (j.arrive === '1') { end = start - 3; start = end - min; }
  const t = x => mk(Math.floor(x / 60), x % 60);
  return { Trip: [{ LegList: { Leg: [
    { type: 'WALK', Origin: { date: date, time: t(start) }, Destination: { date: date, time: t(start + 6) } },
    { type: 'JNY', Origin: { date: date, time: t(start + 6) }, Destination: { date: date, time: t(end - 4) } },
    { type: 'WALK', Origin: { date: date, time: t(end - 4) }, Destination: { date: date, time: t(end) } },
  ] } }] };
}
function embed(texts) {
  calls.embed++;
  // Simple "embedding": word counts for a fixed word list
  const WORDS = ['data', 'analys', 'python', 'sql', 'power bi', 'dashboard', 'pipeline', 'utveckl', 'konsult', 'lager'];
  return { embeddings: texts.map(t => WORDS.map(o => (t.toLowerCase().split(o).length - 1) + 0.01)) };
}

// ---------- Run the chain ----------
(async () => {
  const chain = [];
  for (let n = 'Read profiles'; n; ) {
    chain.push(n);
    n = WF.connections[n]?.main?.[0]?.[0]?.node;
  }
  parent['Read profiles'] = null;
  for (let i = 1; i < chain.length; i++) parent[chain[i]] = chain[i - 1];

  const peopleDir = process.env.PEOPLE_DIR || path.join(__dirname, '../config.example');
  for (const name of chain) {
    const prev = parent[name] ? out[parent[name]] : null;
    let res;
    switch (name) {
      case 'Read profiles':
        res = fs.readdirSync(peopleDir).filter(f => f.endsWith('.json')).map((f, i) => ({ json: {}, fil: f, pairedItem: { item: 0 } }));
        break;
      case 'Parse profiles':
        res = prev.map((it, i) => ({ json: { data: JSON.parse(fs.readFileSync(path.join(peopleDir, it.fil), 'utf8')) }, pairedItem: { item: i } }));
        break;
      case 'Search jobs':
        res = prev.flatMap((it, i) => jobtech(it.json.url).map(page => ({ json: page, pairedItem: { item: i } })));
        break;
      case 'Match profile':
        res = prev.map((it, i) => ({ json: embed(it.json.texts), pairedItem: { item: i } }));
        break;
      case 'Car':
        res = prev.map((it, i) => ({ json: ors(it.json), pairedItem: { item: i } }));
        break;
      case 'Transit':
        res = prev.map((it, i) => ({ json: resrobot(it.json), pairedItem: { item: i } }));
        break;
      case 'Transit from Arlanda':
        res = prev.map((it, i) => ({ json: resrobot({ ...it.json, time: '07:00' }, { lat: 59.6497, lon: 17.9286 }), pairedItem: { item: i } }));
        break;
      case 'Daily thought':
        res = prev.map((it, i) => ({ json: { text: `<think>hmm</think>"Test thought ${i}: ${/\{(theme|earlier)\}/.test(it.json.thoughtPrompt) ? 'PLACEHOLDER LEFT' : 'ok'}"` }, pairedItem: { item: i } }));
        break;
      case 'Send email':
        res = prev;
        break;
      default:
        res = await runCode(name, prev);
    }
    out[name] = res;
    ran.add(name);
    console.log(`${name.padEnd(24)} ${String(res.length).padStart(3)} rows`);
  }

  // ---------- Results ----------
  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  for (const [i, m] of out['Send email'].entries()) {
    fs.writeFileSync(path.join(outDir, `email-${i}.html`), `<!-- to: ${m.json.to} bcc: ${m.json.bcc} subject: ${m.json.subject} -->\n${m.json.html}`);
  }
  fs.writeFileSync(path.join(outDir, 'jobs.json'), JSON.stringify(out['Attach travel times'].map(i => i.json), null, 1));
  fs.writeFileSync(path.join(outDir, 'state.json'), JSON.stringify({
    seen: Object.fromEntries(Object.entries(staticData.global.seen || {}).map(([k, v]) => [k, v.length])),
    travelCache: staticData.global.travelCache, thoughts: staticData.global.thoughts
  }, null, 1));
  console.log('\nAPI calls:', JSON.stringify({ ...calls, jobtech: calls.jobtech.length }));
  console.log('ResRobot times:', calls.resrobot.join(', '));
  console.log('Emails:', out['Send email'].map(m => `${m.json.to} | ${m.json.subject}`).join('\n        '));
})().catch(e => { console.error(e); process.exit(1); });
