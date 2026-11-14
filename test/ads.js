// Made-up ads in JobTech's format, written in Swedish like the real ones, for the example profile.
// Each ad exercises a filter or scoring rule; the comment says which. Coordinates are [lon, lat].
const P = {
  Göteborg: [11.9746, 57.7072], Mölndal: [12.0139, 57.6554], Borås: [12.9401, 57.7210], Kungsbacka: [12.0778, 57.4875],
  Jönköping: [14.1618, 57.7826], Stockholm: [18.0686, 59.3293], Umeå: [20.2630, 63.8258],
};
let n = 1000;
const ad = (headline, town, text, extra = {}) => ({
  id: String(++n), headline,
  description: { text },
  employer: { name: extra.employer || 'Exempelföretaget AB', organization_number: extra.org || '5560000000' },
  workplace_address: { municipality: town, coordinates: P[town] },
  publication_date: extra.pub || '2026-11-14T08:00:00', application_deadline: extra.deadline || '2026-12-01T23:59:59',
  webpage_url: `https://arbetsformedlingen.se/platsbanken/annonser/${n}`,
  remote_work: !!extra.remote, driving_license_required: !!extra.licence, experience_required: !!extra.experience,
  employment_type: { label: extra.form || 'Vanlig anställning' }, working_hours_type: { label: extra.hours || 'Heltid' },
  occupation: { label: extra.occupation || '' }, occupation_field: { label: extra.field || '' },
  salary_description: extra.salary || '',
});
module.exports = [
  // Kept: main area, working hours in the ad ("kl. 8-17") -> arrival time from the ad, salary label
  ad('Dataanalytiker', 'Göteborg', 'Vi söker en dataanalytiker som bygger dashboards i Power BI och skriver SQL. Arbetstid kl. 8-17. Lön 42 000 kr. Kompetensutveckling ingår.'),
  // Kept: municipality (org number 2120...), no working hours -> default arrival time
  ad('BI-utvecklare', 'Mölndal', 'Exempelkommunen söker BI-utvecklare med Python och SQL. Vi erbjuder vidareutbildning.', { org: '2120000000', employer: 'Exempelkommunen' }),
  // Kept but lowered: senior title outside the main area, stress words, a skill the person lacks (Azure)
  ad('Senior Data Engineer', 'Borås', 'Bygg datapipelines i Azure med Python och dbt. Högt tempo och många bollar i luften.'),
  // Kept: remote, far away -> "Distans eller hybrid", no travel time
  ad('Dataanalytiker på distans', 'Umeå', 'Arbeta på distans som dataanalytiker med Python och Tableau.', { remote: true }),
  // Kept: staffing agency (name matches staffingRe)
  ad('Python-utvecklare', 'Kungsbacka', 'Konsultuppdrag på uppdrag av vår kund. Python och pandas.', { employer: 'Exempel Consulting AB' }),
  // Dropped: rejected title
  ad('Säljare BI-lösningar', 'Göteborg', 'Sälj BI-lösningar och Power BI-licenser.'),
  // Dropped: too far away (Stockholm > maxDistanceKm) and not remote
  ad('Dataanalytiker', 'Stockholm', 'Dataanalytiker till vårt kontor i Stockholm. Power BI och SQL.'),
  // Dropped: no area matches
  ad('Lagermedarbetare', 'Göteborg', 'Plock och pack på vårt lager.'),
  // Same position in two towns -> merged into one row with both towns
  ad('Dataanalytiker till ekonomiavdelningen', 'Göteborg', 'Analysera ekonomidata i Power BI.', { employer: 'Exempelkoncernen AB' }),
  ad('Dataanalytiker till ekonomiavdelningen', 'Jönköping', 'Analysera ekonomidata i Power BI.', { employer: 'Exempelkoncernen AB' }),
];
