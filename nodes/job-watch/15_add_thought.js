// Node: Code "Add thought"
// Mode: Run Once for All Items
// Puts the daily thought at the top of each email and remembers it, so it isn't repeated.
// The model answers once per email in the same order, so row i belongs to email i.
const people = Object.fromEntries($('Select people').all().map(i => [i.json.id, i.json]));
const emails = $('Compose email').all().map(i => i.json);
const answers = $input.all().map(i => i.json);
const sd = $getWorkflowStaticData('global');
sd.thoughts ??= {};

return emails.map((e, i) => {
  // From the profile (jobs.thought): replacements [regex, flags, replacement] applied in order, and rejectRe:
  // a thought matching it (e.g. words in the wrong language) is skipped that day rather than sent.
  const T = people[e.person]?.jobs?.thought || {};
  let thought = e.hasThought ? String(answers[i]?.text || '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^["“”'\s]+|["“”'\s]+$/g, '')
    .trim() : '';
  for (const [re, flags, to] of (T.replacements || [])) thought = thought.replace(new RegExp(re, flags ?? 'g'), to);
  thought = thought.trim();
  if (T.rejectRe && new RegExp(T.rejectRe, 'i').test(thought)) thought = '';

  if (thought) sd.thoughts[e.person] = [...(sd.thoughts[e.person] || []), thought].slice(-30);

  const box = thought
    ? `<div style="background:#f6f3ee;border-left:4px solid #c8a96a;padding:12px 16px;margin:0 0 20px;font-family:Georgia,serif;font-size:16px;font-style:italic;color:#333">${thought.replace(/</g, '&lt;')}</div>`
    : '';

  return { json: {
    subject: e.subject,
    html: e.html.replace('<h2>', box + '<h2>'),
    from: e.from,
    to: e.to,
    bcc: e.bcc
  } };
});
