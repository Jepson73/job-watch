// Node: Code "Rank"
// Mode: Run Once for All Items
// Runs after the HTTP node "Match profile". Scores every ad with the person's rules
// (jobs.ranking in the profile) and passes on only the best ones.
//
// A rule in the profile looks like this:
//   { "name": "stress", "when": [{ "re": "högt tempo|stresstålig" }], "maxCount": 3,
//     "weight": -0.2, "reason": "obs: tecken på högt tempo" }
// "when" is a list of conditions, any of which may match:
//   { "re": "...", "field": "text" | "title" | "workingHours" }   or   { "flag": "remote" }
// maxCount: count matches and divide by maxCount (0 to 1). Without it a match counts as 1.
// exceptAreas: the rule doesn't apply if the ad matches one of these areas.
// exceptRule: the rule doesn't apply if the named rule (earlier in the list) matched.
// reasonFrom: lowest value for "reason" to be shown (default: any match).
// label: shown as a tag in the email when the rule matches.

const people = Object.fromEntries($('Select people').all().map(i => [i.json.id, i.json]));
const sd = $getWorkflowStaticData('global');
sd.seen ??= {};

const cos = (a, b) => {
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return s / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};
// Same position advertised in several towns gets the same key
const sameJobKey = j => `${j.nationwide ? 'N' : ''}${j.employer}|${(j.title || '').split(j.town || '\u0000').join('')}`
  .toLowerCase().replace(/[^a-zåäö0-9|]/g, '');

const out = [];
for (const [idx, item] of $input.all().entries()) {
  let prep;
  try { prep = $('Prepare matching').itemMatching(idx).json; } catch (e) { prep = $('Prepare matching').all()[idx]?.json; }
  if (!prep) continue;
  const p = people[prep.person];
  const R = p.jobs.ranking || {};
  const jobs = prep.jobs;
  const emb = item.json.embeddings || [];

  const rules = (R.rules || []).map(r => ({
    ...r,
    conditions: (r.when || []).map(c => ({ ...c, re: c.re ? new RegExp(c.re, 'gi') : null }))
  }));

  // Profile match: rank among today's ads (0 to 1), computed separately for local and nationwide
  const profile = emb[0];
  const similarity = jobs.map((_, i) => (profile && emb[i + 1]) ? cos(profile, emb[i + 1]) : 0);
  const percentileFor = nationwide => {
    const s = similarity.filter((_, i) => !!jobs[i].nationwide === nationwide).sort((a, b) => a - b);
    return v => s.length > 1 ? s.indexOf(v) / (s.length - 1) : 1;
  };
  const pLocal = percentileFor(false), pNationwide = percentileFor(true);

  for (const [i, j] of jobs.entries()) {
    const text = `${j.title} ${j.description}`;
    const match = (j.nationwide ? pNationwide : pLocal)(similarity[i]);
    const values = {};
    let sum = (R.matchWeight ?? 0.45) * match;
    const reasons = [];
    const labels = [];
    if (R.matchReason && match >= (R.matchReasonFrom ?? 0.75)) reasons.push(R.matchReason);
    if (j.areas.length) reasons.push(j.areas.join(' + '));
    if (R.showWorkingHours && j.workingHours) reasons.push(j.workingHours.toLowerCase());

    for (const r of rules) {
      let v = 0;
      const blocked = (r.exceptAreas || []).some(a => j.areas.includes(a)) || (r.exceptRule && values[r.exceptRule] > 0);
      if (!blocked) {
        let n = 0;
        for (const c of r.conditions) {
          if (c.flag) { if (j[c.flag]) n += 1; continue; }
          const field = c.field === 'title' ? (j.title || '') : c.field === 'workingHours' ? (j.workingHours || '') : text;
          n += (field.match(c.re) || []).length;
        }
        v = !n ? 0 : (r.maxCount ? Math.min(n, r.maxCount) / r.maxCount : 1);
      }
      values[r.name] = v;
      sum += (r.weight || 0) * v;
      if (v > 0 && r.reason && v >= (r.reasonFrom ?? 0)) reasons.push(r.reason);
      if (v > 0 && r.label) labels.push(r.label);
    }

    let score = Math.round(100 * sum);
    if (R.scoreFloor != null) score = Math.max(R.scoreFloor, score);
    j.score = score;
    j.reasons = reasons.join(' · ');
    j.labels = labels;
  }

  jobs.sort((a, b) => b.score - a.score || b.published.localeCompare(a.published));

  // A position in several towns counts once: the best UNIQUE positions go on, with all their towns
  const pick = (list, max) => {
    const picked = new Set();
    for (const j of list) {
      if (picked.size >= max) break;
      picked.add(sameJobKey(j));
    }
    return list.filter(j => picked.has(sameJobKey(j)));
  };
  const kept = [
    ...pick(jobs.filter(j => !j.nationwide), R.maxCount ?? 25),
    ...pick(jobs.filter(j => j.nationwide), p.jobs.search?.nationwide?.count ?? 0),
  ];
  const keptIds = new Set(kept.map(j => j.id));

  // Ads dropped today are marked as seen, so they are not ranked again every day.
  // Ads that go on are marked as seen in "Compose email".
  const dropped = jobs.filter(j => !keptIds.has(j.id)).map(j => j.id);
  sd.seen[p.id] = [...(sd.seen[p.id] || []), ...dropped].slice(-5000);

  for (const { description, ...j } of kept) out.push({ json: j });
}
return out;
