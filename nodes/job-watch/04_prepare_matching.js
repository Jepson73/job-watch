// Node: Code "Prepare matching"
// Mode: Run Once for All Items
// One request to the embedding model per person: the profile text first, then all of that person's ads.

const people = Object.fromEntries($('Select people').all().map(i => [i.json.id, i.json]));
const byPerson = {};
for (const { json: j } of $input.all()) (byPerson[j.person] ??= []).push(j);

return Object.entries(byPerson).map(([id, jobs]) => {
  const p = people[id];
  const texts = [
    p.jobs.matching?.profile || '',
    ...jobs.map(j => `${j.title}. ${j.employer}. ${j.description}`.slice(0, 2500))
  ];
  return { json: {
    person: id,
    jobs,
    texts,
    embedUrl: p.global.embedUrl,
    embedModel: p.global.embedModel || 'bge-m3'
  } };
});
