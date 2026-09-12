export default {
  title: 'Page Weight Course',
  id: 'urn:uuid:8f21c05a-6b3e-4d77-9a10-5c8e2b7f41d6',
  description:
    'Fixture for per-page weights: two graded pages whose course rollup is Σ(w·pageScore)/Σ(w)',
  author: 'Tessera E2E',
  version: '1.0.0',
  language: 'en',
  navigation: { mode: 'free' },
  completion: { mode: 'percentage', percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: 'web' },
};
