// Node: Code "Add thought"
// Mode: Run Once for All Items
// Puts the daily thought at the top of each email and remembers it, so it isn't repeated.
// The model answers once per email in the same order, so row i belongs to email i.
const emails = $('Compose email').all().map(i => i.json);
const answers = $input.all().map(i => i.json);
const sd = $getWorkflowStaticData('global');
sd.thoughts ??= {};

// The thought must be Swedish: if the model slips into English, skip it that day rather than send Swenglish.
const ENGLISH = /\b(take|the|you|your|step|steps|don't|it's|every|today|keep|just do|journey|will|with|yourself|and)\b/i;

return emails.map((e, i) => {
  let thought = e.hasThought ? String(answers[i]?.text || '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^["“”'\s]+|["“”'\s]+$/g, '')
    .replace(/\s*[–—]\s*/g, ', ')     // dashes become commas, like in the letters
    .replace(/,\s*([.!?])/g, '$1')
    .trim() : '';
  if (ENGLISH.test(thought)) thought = '';

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
