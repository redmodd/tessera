export interface CourseConfig {
  title: string;
  description: string;
  author: string;
  version: string;
  branding: {
    logo: string;
    primaryColor: string;
    fontFamily: string;
  };
  navigation: {
    mode: 'free' | 'sequential';
  };
  completion: {
    mode: 'quiz' | 'percentage';
    percentageThreshold?: number;
  };
  scoring: {
    passingScore: number;
  };
  export: {
    standard: 'web' | 'scorm12' | 'scorm2004' | 'cmi5';
  };
}
