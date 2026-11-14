// Node: Code "Build searches"
// Mode: Run Once for All Items
// One JobTech search URL per query and person. Queries live in each profile under jobs.search.

const sd = $getWorkflowStaticData('global');
const query = obj => Object.entries(obj)
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
const url = p => `https://jobsearch.api.jobtechdev.se/search?${query(p)}`;
const since = days => new Date(Date.now() - days * 864e5).toISOString().slice(0, 19);

const out = [];
for (const { json: p } of $input.all()) {
  const s = p.jobs.search || {};
  // Empty memory (first run) looks further back
  const hasMemory = (sd.seen?.[p.id] || []).length > 0;
  const days = hasMemory ? (s.daysBack ?? 5) : (s.daysBackFirstRun ?? s.daysBack ?? 5);

  // Local searches first: an ad found by both counts as local
  for (const q of (s.queries || [])) {
    const param = { q: q.q, limit: '100', sort: 'pubdate-desc', 'published-after': since(days) };
    if (q.remote) param.remote = 'true';
    if (s.radiusKm) {
      param.position = `${p.home.lat},${p.home.lon}`;
      param['position.radius'] = String(s.radiusKm);
    }
    out.push({ json: { person: p.id, area: q.area || q.q, nationwide: false, url: url(param) } });
  }

  // Nationwide: the same kind of jobs anywhere in the country, no distance filter
  const nw = s.nationwide;
  if (nw) {
    for (const q of (nw.queries || [])) {
      const param = { q, limit: '100', sort: 'pubdate-desc', 'published-after': since(Math.min(days, nw.maxDays ?? 7)) };
      out.push({ json: { person: p.id, area: 'Nationwide', nationwide: true, url: url(param) } });
    }
  }
}
return out;
