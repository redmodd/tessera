export default {
  title: 'Standalone Weight Course',
  id: 'urn:uuid:3d5b1f84-77a2-4c19-9e6b-1a4c2f8d90b3',
  description:
    'Fixture for weighted standalone questions: graded useQuestion widgets with no quiz shell, rolled up as Σ(w·score)/Σ(w)',
  author: 'Tessera E2E',
  version: '1.0.0',
  language: 'en',
  navigation: { mode: 'free' },
  completion: { mode: 'percentage', percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: 'web' },
};
