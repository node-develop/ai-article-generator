import type { StyleMetrics } from './style-types.js';

const SENTENCE_END_RE = /[.!?…]+(?:\s|$)/g;
const PARAGRAPH_SPLIT_RE = /\n\s*\n/;
const SECTION_HEADING_RE = /^#{1,3}\s+/m;
const LIST_ITEM_RE = /^[\s]*[-*+]\s|^[\s]*\d+[.)]\s/gm;
const CODE_BLOCK_RE = /```[\s\S]*?```/g;
const QUESTION_RE = /[?？]/g;

const TECH_TERMS = new Set([
  'api', 'cpu', 'gpu', 'ram', 'ssd', 'hdd', 'http', 'https', 'sql', 'nosql',
  'json', 'xml', 'html', 'css', 'docker', 'kubernetes', 'linux', 'nginx',
  'postgresql', 'redis', 'mongodb', 'git', 'ci/cd', 'devops', 'saas', 'iaas',
  'paas', 'cdn', 'dns', 'tcp', 'udp', 'rest', 'graphql', 'grpc', 'websocket',
  'ssl', 'tls', 'jwt', 'oauth', 'ssh', 'vpn', 'iot', 'ml', 'ai', 'llm',
  'npm', 'yarn', 'webpack', 'vite', 'react', 'vue', 'angular', 'node.js',
  'typescript', 'javascript', 'python', 'golang', 'rust', 'java', 'kotlin',
  'backend', 'frontend', 'fullstack', 'microservices', 'serverless',
  'контейнер', 'кластер', 'деплой', 'сервер', 'фреймворк', 'библиотека',
  'интерфейс', 'протокол', 'архитектура', 'инфраструктура', 'виртуализация',
]);

const splitSentences = (text: string): string[] => {
  // Remove code blocks before sentence splitting
  const noCode = text.replace(CODE_BLOCK_RE, '');
  const sentences = noCode.split(SENTENCE_END_RE).filter((s) => s.trim().length > 3);
  return sentences;
};

const countWords = (text: string): number => {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
};

const stddev = (values: number[]): number => {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sq = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(sq.reduce((a, b) => a + b, 0) / values.length);
};

export const computeStyleMetrics = (cleanText: string): StyleMetrics => {
  const totalWords = countWords(cleanText);
  if (totalWords === 0) {
    return {
      avgSentenceLength: 0,
      sentenceLengthVariance: 0,
      avgParagraphLength: 0,
      avgSectionLength: 0,
      vocabularyRichness: 0,
      technicalTermDensity: 0,
      questionFrequency: 0,
      listUsageRate: 0,
      codeBlockRate: 0,
    };
  }

  // Sentence metrics
  const sentences = splitSentences(cleanText);
  const sentenceLengths = sentences.map(countWords);
  const avgSentenceLength = sentenceLengths.length > 0
    ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
    : 0;
  const sentenceLengthVariance = stddev(sentenceLengths);

  // Paragraph metrics
  const paragraphs = cleanText.split(PARAGRAPH_SPLIT_RE).filter((p) => p.trim().length > 10);
  const paragraphSentenceCounts = paragraphs.map((p) => splitSentences(p).length);
  const avgParagraphLength = paragraphSentenceCounts.length > 0
    ? paragraphSentenceCounts.reduce((a, b) => a + b, 0) / paragraphSentenceCounts.length
    : 0;

  // Section metrics
  const sections = cleanText.split(SECTION_HEADING_RE).filter((s) => s.trim().length > 10);
  const sectionWordCounts = sections.map(countWords);
  const avgSectionLength = sectionWordCounts.length > 0
    ? sectionWordCounts.reduce((a, b) => a + b, 0) / sectionWordCounts.length
    : totalWords;

  // Vocabulary richness (type-token ratio)
  const words = cleanText.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const uniqueWords = new Set(words);
  const vocabularyRichness = words.length > 0 ? uniqueWords.size / words.length : 0;

  // Technical term density (per 100 words)
  const techTermCount = words.filter((w) => TECH_TERMS.has(w.replace(/[.,;:!?()]/g, ''))).length;
  const technicalTermDensity = (techTermCount / totalWords) * 100;

  // Question frequency (per 1000 words)
  const questionCount = (cleanText.match(QUESTION_RE) || []).length;
  const questionFrequency = (questionCount / totalWords) * 1000;

  // List usage rate (list items per section)
  const listItemCount = (cleanText.match(LIST_ITEM_RE) || []).length;
  const sectionCount = Math.max(sections.length, 1);
  const listUsageRate = listItemCount / sectionCount;

  // Code block rate (per 1000 words)
  const codeBlockCount = (cleanText.match(CODE_BLOCK_RE) || []).length;
  const codeBlockRate = (codeBlockCount / totalWords) * 1000;

  return {
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    sentenceLengthVariance: Math.round(sentenceLengthVariance * 10) / 10,
    avgParagraphLength: Math.round(avgParagraphLength * 10) / 10,
    avgSectionLength: Math.round(avgSectionLength),
    vocabularyRichness: Math.round(vocabularyRichness * 1000) / 1000,
    technicalTermDensity: Math.round(technicalTermDensity * 10) / 10,
    questionFrequency: Math.round(questionFrequency * 10) / 10,
    listUsageRate: Math.round(listUsageRate * 10) / 10,
    codeBlockRate: Math.round(codeBlockRate * 10) / 10,
  };
};
