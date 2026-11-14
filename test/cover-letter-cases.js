// Test cases for the cover letter workflow: a made-up ad plus a made-up model answer.
// The answers deliberately contain things the cleanup must catch: dashes, filler words,
// a skill the person lacks, an unknown system, and "ser fram emot" outside the closing.
const ad = (id, headline, employer, text, extra = {}) => ({
  id, headline, employer: { name: employer },
  description: { text },
  workplace_address: { municipality: extra.town || 'Göteborg' },
  employment_type: { label: 'Vanlig anställning' },
  application_deadline: '2026-12-01T23:59:59',
  webpage_url: `https://arbetsformedlingen.se/platsbanken/annonser/${id}`,
  application_details: { reference: extra.reference || '' },
  must_have: { skills: (extra.skills || []).map(label => ({ label })) },
  occupation: { label: extra.occupation || 'Dataanalytiker' },
  occupation_field: { label: extra.field || 'Data/IT' },
});

module.exports = {
  // Swedish ad that names Azure (missing skill) and personalansvar (gap)
  swedish: {
    ad: ad('2001', 'Dataanalytiker', 'EXEMPELFÖRETAGET AB',
      'Vi söker en dataanalytiker med SQL och Power BI. Meriterande: Azure. Rollen har på sikt personalansvar. Arbete på distans möjligt.',
      { reference: 'REF-123', skills: ['SQL', 'Power BI'] }),
    motivation: 'Jag gillar att göra rörig data begriplig.',
    answer: {
      inledning: 'Jag tar med mig fyra år av dashboards och SQL – och en vana att fråga varför siffrorna ser ut som de gör.',
      matchning: 'I mitt nuvarande jobb bygger jag rapporter i Power BI. Jag har en gedigen erfarenhet av SQL. Jag har arbetat mycket i Azure.',
      bidrag: ['Jag automatiserade månadsrapporterna i Python, vilket gav stora tidsvinster.', 'Jag har även byggt flöden i Snowflake.'],
      utveckling: 'Jag ser fram emot att lära mig mer om dataplattformar. Jag är passionerad för data.',
      avslutning: 'Jag ser fram emot att höra från er.',
      tips: ['Nämn ett konkret exempel på en rapport som ändrade ett beslut.'],
    },
  },
  // English ad: the letter is written in English, the email around it stays Swedish
  english: {
    ad: ad('2002', 'Data Analyst', 'Example Ltd',
      'We are looking for a data analyst who will work with our team. You have experience with SQL and AWS, and you are curious about the data.'),
    answer: {
      inledning: 'I bring four years of turning messy data into reports people use.',
      matchning: 'I write SQL every day and build dashboards in Power BI. I have deployed pipelines on AWS.',
      bidrag: 'I automated our monthly reporting in Python.',
      utveckling: 'I look forward to learning more about cloud data platforms.',
      avslutning: 'I look forward to hearing from you.',
    },
  },
  // The model returned something that isn't JSON
  broken: {
    ad: ad('2003', 'BI-utvecklare', 'Exempelkommunen', 'BI-utvecklare till kommunen.'),
    answer: 'Här är ett brev: Hej! Jag vill gärna jobba hos er.',
  },
};
