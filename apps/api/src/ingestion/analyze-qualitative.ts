import { createFastModel } from '../lib/openrouter.js';
import type { StyleQualitative, StyleStructural } from './style-types.js';

const STYLE_ANALYSIS_PROMPT = `Ты — лингвист-аналитик. Проанализируй стиль текста ниже и верни JSON (без markdown-обёртки) со следующими полями:

{
  "qualitative": {
    "toneDescription": "2-3 предложения, описывающих тон и манеру изложения",
    "openingPattern": "как автор начинает статью (тип хука: вопрос, утверждение, история, статистика)",
    "transitionStyle": "как связаны секции между собой",
    "conclusionPattern": "как автор завершает статью",
    "humorLevel": "none | subtle | moderate | frequent",
    "authorVoice": "лицо повествования и уровень формальности",
    "readerAddress": "как обращается к читателю (вы/ты/не обращается)",
    "explanationStrategy": "как объясняет сложное (аналогии/примеры/спецификации/пошагово)",
    "characteristicPhrases": ["5-10 характерных конструкций и оборотов, которые использует автор"],
    "avoidedPatterns": ["3-5 паттернов, которые автор НЕ использует (например, канцелярит, клише)"]
  },
  "structural": {
    "headingStyle": "стиль заголовков (описательные/вопросительные/императивные/смешанные)",
    "paragraphTransitions": ["3-5 примеров переходных фраз между абзацами из текста"],
    "listIntroPatterns": ["как автор вводит списки (примеры фраз)"],
    "typicalFlow": "общая структура повествования (например: проблема → решение → практика)"
  }
}

Тип контента: {contentType}
Заголовок: {title}

НАЧАЛО ТЕКСТА:
{textStart}

КОНЕЦ ТЕКСТА:
{textEnd}

Верни ТОЛЬКО валидный JSON. Без markdown-обёртки, без пояснений.`;

export const analyzeStyleQualitative = async (
  title: string,
  cleanText: string,
  contentType: string,
): Promise<{ qualitative: StyleQualitative; structural: StyleStructural }> => {
  const textStart = cleanText.slice(0, 3000);
  const textEnd = cleanText.length > 4000 ? cleanText.slice(-1000) : '';

  const prompt = STYLE_ANALYSIS_PROMPT
    .replace('{contentType}', contentType)
    .replace('{title}', title)
    .replace('{textStart}', textStart)
    .replace('{textEnd}', textEnd);

  const model = createFastModel({ temperature: 0.1, maxTokens: 2000 });

  const response = await model.invoke([
    { role: 'user', content: prompt },
  ]);

  const rawContent = String(response.content).trim();

  // Strip markdown code fences if present
  const jsonStr = rawContent
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const parsed = JSON.parse(jsonStr);

  const qualitative: StyleQualitative = {
    toneDescription: parsed.qualitative?.toneDescription || '',
    openingPattern: parsed.qualitative?.openingPattern || '',
    transitionStyle: parsed.qualitative?.transitionStyle || '',
    conclusionPattern: parsed.qualitative?.conclusionPattern || '',
    humorLevel: parsed.qualitative?.humorLevel || 'none',
    authorVoice: parsed.qualitative?.authorVoice || '',
    readerAddress: parsed.qualitative?.readerAddress || '',
    explanationStrategy: parsed.qualitative?.explanationStrategy || '',
    characteristicPhrases: parsed.qualitative?.characteristicPhrases || [],
    avoidedPatterns: parsed.qualitative?.avoidedPatterns || [],
  };

  const structural: StyleStructural = {
    headingStyle: parsed.structural?.headingStyle || '',
    paragraphTransitions: parsed.structural?.paragraphTransitions || [],
    listIntroPatterns: parsed.structural?.listIntroPatterns || [],
    typicalFlow: parsed.structural?.typicalFlow || '',
  };

  return { qualitative, structural };
};
