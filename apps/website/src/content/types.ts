export type Language = 'zh' | 'en';

export interface FeatureSection {
  title: string;
  body: string;
  points: string[];
}

export interface FeatureContent {
  title: string;
  headline: string;
  summary: string;
  audience: string;
  sections: FeatureSection[];
  steps: string[];
  note: string;
  faqs: { question: string; answer: string }[];
}

export interface Feature {
  slug: string;
  number: string;
  category: 'build' | 'connect' | 'manage' | 'personalize';
  image: string;
  imageAlt: Record<Language, string>;
  imageKind?: 'diagram' | 'compact';
  source: string;
  related: string[];
  zh: FeatureContent;
  en: FeatureContent;
}
