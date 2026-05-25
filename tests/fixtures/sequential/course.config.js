export default {
  title: 'Sequential Test Course',
  description: 'A course for testing sequential navigation mode',
  author: 'Tessera E2E',
  version: '1.0.0',
  language: 'en',
  branding: {
    logo: '',
    primaryColor: '#2563eb',
    fontFamily: 'Inter, sans-serif',
  },
  navigation: { mode: 'sequential' },
  completion: { mode: 'percentage', percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: 'web' },
};
