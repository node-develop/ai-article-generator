import type { StyleProfile } from '../rag/retrieval.js';

const avg = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
};

const range = (values: number[]): string => {
  if (values.length === 0) return '—';
  const min = Math.round(Math.min(...values));
  const max = Math.round(Math.max(...values));
  return min === max ? `~${min}` : `${min}–${max}`;
};

const collectUnique = (arrays: string[][], limit: number): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const arr of arrays) {
    for (const item of arr) {
      const normalized = item.trim().toLowerCase();
      if (!seen.has(normalized) && item.trim()) {
        seen.add(normalized);
        result.push(item.trim());
        if (result.length >= limit) return result;
      }
    }
  }
  return result;
};

const mostCommon = (values: string[]): string => {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best || values[0] || '';
};

export const formatStyleGuide = (
  profiles: StyleProfile[],
  contentType: string,
): string => {
  if (profiles.length === 0) return '';

  const n = profiles.length;

  // Aggregate metrics
  const sentLens = profiles.map((p) => p.metrics.avgSentenceLength);
  const paraLens = profiles.map((p) => p.metrics.avgParagraphLength);
  const secLens = profiles.map((p) => p.metrics.avgSectionLength);
  const vocabRich = profiles.map((p) => p.metrics.vocabularyRichness);
  const techDens = profiles.map((p) => p.metrics.technicalTermDensity);
  const questionFreqs = profiles.map((p) => p.metrics.questionFrequency);
  const listRates = profiles.map((p) => p.metrics.listUsageRate);

  // Aggregate qualitative
  const toneDescriptions = profiles.map((p) => p.qualitative.toneDescription).filter(Boolean);
  const humorLevels = profiles.map((p) => p.qualitative.humorLevel);
  const readerAddresses = profiles.map((p) => p.qualitative.readerAddress).filter(Boolean);
  const voiceDescriptions = profiles.map((p) => p.qualitative.authorVoice).filter(Boolean);
  const explanationStrategies = profiles.map((p) => p.qualitative.explanationStrategy).filter(Boolean);
  const charPhrases = collectUnique(profiles.map((p) => p.qualitative.characteristicPhrases), 10);
  const avoidedPatterns = collectUnique(profiles.map((p) => p.qualitative.avoidedPatterns), 8);

  // Aggregate structural
  const headingStyles = profiles.map((p) => p.structural.headingStyle).filter(Boolean);
  const transitions = collectUnique(profiles.map((p) => p.structural.paragraphTransitions), 5);
  const listIntros = collectUnique(profiles.map((p) => p.structural.listIntroPatterns), 4);
  const flows = profiles.map((p) => p.structural.typicalFlow).filter(Boolean);

  const lines: string[] = [];

  lines.push(`## СТИЛЕВОЕ РУКОВОДСТВО (на основе ${n} эталонных статей типа «${contentType}»)`);
  lines.push('');

  // Metrics section
  lines.push('### Метрики текста');
  lines.push(`- Средняя длина предложения: ${range(sentLens)} слов (чередуй короткие и длинные)`);
  lines.push(`- Абзацы: ${range(paraLens)} предложений`);
  lines.push(`- Секции (H2): ${range(secLens)} слов`);
  lines.push(`- Лексическое разнообразие (TTR): ${(avg(vocabRich) * 100).toFixed(0)}% — ${avg(vocabRich) > 0.5 ? 'богатый словарный запас' : 'умеренный словарный запас'}`);
  lines.push(`- Плотность техтерминов: ${avg(techDens).toFixed(1)} на 100 слов`);
  if (avg(questionFreqs) > 1) {
    lines.push(`- Вопросы в тексте: ${avg(questionFreqs).toFixed(1)} на 1000 слов — используй риторические вопросы`);
  }
  if (avg(listRates) > 0.5) {
    lines.push(`- Списки: ${avg(listRates).toFixed(1)} на секцию — активно используй маркированные/нумерованные списки`);
  }
  lines.push('');

  // Tone section
  lines.push('### Тон и голос');
  if (toneDescriptions.length > 0) {
    lines.push(`- ${toneDescriptions[0]}`);
  }
  if (voiceDescriptions.length > 0) {
    lines.push(`- Голос: ${mostCommon(voiceDescriptions)}`);
  }
  if (readerAddresses.length > 0) {
    lines.push(`- Обращение к читателю: ${mostCommon(readerAddresses)}`);
  }
  const commonHumor = mostCommon(humorLevels);
  if (commonHumor && commonHumor !== 'none') {
    lines.push(`- Юмор: ${commonHumor === 'subtle' ? 'лёгкий, уместный' : commonHumor === 'moderate' ? 'умеренный' : 'частый'}`);
  }
  if (explanationStrategies.length > 0) {
    lines.push(`- Объяснение сложного: ${mostCommon(explanationStrategies)}`);
  }
  lines.push('');

  // Structure section
  lines.push('### Структура');
  if (headingStyles.length > 0) {
    lines.push(`- Стиль заголовков: ${mostCommon(headingStyles)}`);
  }
  if (flows.length > 0) {
    lines.push(`- Типичная структура: ${flows[0]}`);
  }
  if (transitions.length > 0) {
    lines.push('- Переходы между абзацами:');
    for (const t of transitions) {
      lines.push(`  - «${t}»`);
    }
  }
  if (listIntros.length > 0) {
    lines.push('- Введение списков:');
    for (const li of listIntros) {
      lines.push(`  - «${li}»`);
    }
  }
  lines.push('');

  // Characteristic phrases
  if (charPhrases.length > 0) {
    lines.push('### Характерные конструкции (ИСПОЛЬЗУЙ)');
    for (const phrase of charPhrases) {
      lines.push(`- «${phrase}»`);
    }
    lines.push('');
  }

  // Avoid section
  if (avoidedPatterns.length > 0) {
    lines.push('### Чего ИЗБЕГАТЬ');
    for (const pattern of avoidedPatterns) {
      lines.push(`- ${pattern}`);
    }
    lines.push('');
  }

  return lines.join('\n');
};
