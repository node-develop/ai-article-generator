import type { ContentType } from '@articleforge/shared';

export interface FormatConfig {
  sectionCount: { min: number; max: number };
  wordsPerSection: { min: number; max: number };
  researchMaxTokens: number;
  outlineMaxTokens: number;
  sectionMaxTokens: number;
  editMaxTokens: number;
  /** Max chars of research/ragContext to feed into section prompts */
  contextSliceLimit: number;
  outlineInstructions: string;
  sectionInstructions: string;
  editInstructions: string;
}

export const FORMAT_CONFIGS: Record<ContentType, FormatConfig> = {
  longread: {
    sectionCount: { min: 4, max: 6 },
    wordsPerSection: { min: 300, max: 500 },
    researchMaxTokens: 4000,
    outlineMaxTokens: 3000,
    sectionMaxTokens: 2000,
    editMaxTokens: 8000,
    contextSliceLimit: 2000,
    outlineInstructions: '4–6 секций H2, каждая с кратким описанием содержания (2-3 предложения). Предусмотри введение и заключение.',
    sectionInstructions: 'Объём: 300–500 слов для секции. Глубокое раскрытие темы.',
    editInstructions: 'Глубокая статья с полным раскрытием темы. Проверь связность между секциями.',
  },
  review: {
    sectionCount: { min: 3, max: 5 },
    wordsPerSection: { min: 200, max: 400 },
    researchMaxTokens: 3000,
    outlineMaxTokens: 2000,
    sectionMaxTokens: 1500,
    editMaxTokens: 6000,
    contextSliceLimit: 2000,
    outlineInstructions: '3–5 секций H2. Включи сравнительные таблицы, плюсы/минусы. Предусмотри итоговый рейтинг или рекомендации.',
    sectionInstructions: 'Объём: 200–400 слов. Фокус на сравнении, плюсах/минусах, конкретных характеристиках.',
    editInstructions: 'Обзорный формат. Проверь объективность, наличие сравнений и конкретных данных.',
  },
  tutorial: {
    sectionCount: { min: 4, max: 8 },
    wordsPerSection: { min: 200, max: 400 },
    researchMaxTokens: 3500,
    outlineMaxTokens: 2500,
    sectionMaxTokens: 1500,
    editMaxTokens: 7000,
    contextSliceLimit: 2000,
    outlineInstructions: '4–8 секций H2 с пошаговой структурой. Каждый шаг — отдельная секция. Включи секцию "Предварительные требования" и "Результат".',
    sectionInstructions: 'Объём: 200–400 слов. Используй блоки кода, конкретные команды, пошаговые инструкции.',
    editInstructions: 'Руководство. Проверь последовательность шагов, наличие примеров кода, воспроизводимость.',
  },
  news: {
    sectionCount: { min: 2, max: 3 },
    wordsPerSection: { min: 150, max: 300 },
    researchMaxTokens: 2000,
    outlineMaxTokens: 1000,
    sectionMaxTokens: 800,
    editMaxTokens: 3000,
    contextSliceLimit: 1000,
    outlineInstructions: '2–3 секции H2. Краткий формат: суть новости, детали, значение для индустрии.',
    sectionInstructions: 'СТРОГИЙ ЛИМИТ: 150–300 слов. Факты, цифры, цитаты. Без лишних подробностей. Новостной формат — кратко и по существу.',
    editInstructions: 'Новостной формат. СТРОГО: каждая секция 150–300 слов. Проверь краткость, актуальность, наличие фактов. Убери всё лишнее.',
  },
  digest: {
    sectionCount: { min: 5, max: 10 },
    wordsPerSection: { min: 50, max: 100 },
    researchMaxTokens: 1500,
    outlineMaxTokens: 1500,
    sectionMaxTokens: 600,
    editMaxTokens: 4000,
    contextSliceLimit: 1500,
    outlineInstructions: '5–10 коротких блоков H2, каждый — отдельная тема или новость. Каждый блок — краткая аннотация. ВАЖНО: каждый блок ОБЯЗАТЕЛЬНО должен начинаться с ## Заголовок.',
    sectionInstructions: 'СТРОГИЙ ЛИМИТ: 50–100 слов, НЕ БОЛЕЕ. Краткая аннотация: суть + ключевой факт. Формат дайджеста. Если текст длиннее 100 слов — это ошибка.',
    editInstructions: 'Дайджест-формат. СТРОГО: каждый блок НЕ БОЛЕЕ 100 слов. Если блок длиннее — сократи до 100 слов. Проверь краткость и разнообразие тем.',
  },
};

export const getFormatConfig = (contentType: string): FormatConfig => {
  return FORMAT_CONFIGS[contentType as ContentType] || FORMAT_CONFIGS.longread;
};
