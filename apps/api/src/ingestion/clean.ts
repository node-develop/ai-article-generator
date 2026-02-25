// Cleaning patterns from PRD section 8.3
const AD_PATTERNS = [
  /Арендуйте .+?→/gs,
  /Облачная инфраструктура .+?→/gs,
  /Снижаем цены .+?→/gs,
  /в панели управления Selectel/g,
  /^Источник\.?\s*$/gm,
  /Подробнее о .+? читайте .+?\./g,
  /Подробности .+? на сайте .+?\./g,
];

const NORMALIZE_PATTERNS: [RegExp, string][] = [
  [/[®™]/g, ''],
  [/\n{3,}/g, '\n\n'],
  [/[ \t]+$/gm, ''],
  [/^\s+$/gm, ''],
];

export const cleanText = (text: string): string => {
  let cleaned = text;

  // Remove ad patterns
  for (const pattern of AD_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Normalize
  for (const [pattern, replacement] of NORMALIZE_PATTERNS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  return cleaned.trim();
};
