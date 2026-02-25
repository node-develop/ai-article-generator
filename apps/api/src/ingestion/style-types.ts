export interface StyleMetrics {
  avgSentenceLength: number;
  sentenceLengthVariance: number;
  avgParagraphLength: number;
  avgSectionLength: number;
  vocabularyRichness: number;
  technicalTermDensity: number;
  questionFrequency: number;
  listUsageRate: number;
  codeBlockRate: number;
}

export interface StyleQualitative {
  toneDescription: string;
  openingPattern: string;
  transitionStyle: string;
  conclusionPattern: string;
  humorLevel: 'none' | 'subtle' | 'moderate' | 'frequent';
  authorVoice: string;
  readerAddress: string;
  explanationStrategy: string;
  characteristicPhrases: string[];
  avoidedPatterns: string[];
}

export interface StyleStructural {
  headingStyle: string;
  paragraphTransitions: string[];
  listIntroPatterns: string[];
  typicalFlow: string;
}
