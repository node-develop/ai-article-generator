import type { ContentType } from '@articleforge/shared';

export interface FormatConfig {
  sectionCount: { min: number; max: number };
  wordsPerSection: { min: number; max: number };
  outlineInstructions: string;
  sectionInstructions: string;
  editInstructions: string;
}

export const FORMAT_CONFIGS: Record<ContentType, FormatConfig> = {
  longread: {
    sectionCount: { min: 4, max: 6 },
    wordsPerSection: { min: 300, max: 500 },
    outlineInstructions: '4–6 секций H2, каждая с кратким описанием содержания (2-3 предложения). Предусмотри введение и заключение.',
    sectionInstructions: 'Объём: 300–500 слов для секции. Глубокое раскрытие темы.',
    editInstructions: 'Глубокая статья с полным раскрытием темы. Проверь связность между секциями.',
  },
  review: {
    sectionCount: { min: 3, max: 5 },
    wordsPerSection: { min: 200, max: 400 },
    outlineInstructions: '3–5 секций H2. Включи сравнительные таблицы, плюсы/минусы. Предусмотри итоговый рейтинг или рекомендации.',
    sectionInstructions: 'Объём: 200–400 слов. Фокус на сравнении, плюсах/минусах, конкретных характеристиках.',
    editInstructions: 'Обзорный формат. Проверь объективность, наличие сравнений и конкретных данных.',
  },
  tutorial: {
    sectionCount: { min: 4, max: 8 },
    wordsPerSection: { min: 200, max: 400 },
    outlineInstructions: '4–8 секций H2 с пошаговой структурой. Каждый шаг — отдельная секция. Включи секцию "Предварительные требования" и "Результат".',
    sectionInstructions: 'Объём: 200–400 слов. Используй блоки кода, конкретные команды, пошаговые инструкции.',
    editInstructions: 'Руководство. Проверь последовательность шагов, наличие примеров кода, воспроизводимость.',
  },
  news: {
    sectionCount: { min: 2, max: 3 },
    wordsPerSection: { min: 150, max: 300 },
    outlineInstructions: '2–3 секции H2. Краткий формат: суть новости, детали, значение для индустрии.',
    sectionInstructions: 'Объём: 150–300 слов. Факты, цифры, цитаты. Без лишних подробностей.',
    editInstructions: 'Новостной формат. Проверь краткость, актуальность, наличие фактов.',
  },
  digest: {
    sectionCount: { min: 5, max: 10 },
    wordsPerSection: { min: 50, max: 100 },
    outlineInstructions: '5–10 коротких блоков H2, каждый — отдельная тема или новость. Каждый блок — краткая аннотация.',
    sectionInstructions: 'Объём: 50–100 слов. Краткая аннотация: суть + ключевой факт. Формат дайджеста.',
    editInstructions: 'Дайджест-формат. Проверь краткость блоков (не более 100 слов каждый), разнообразие тем.',
  },
};

export const getFormatConfig = (contentType: string): FormatConfig => {
  return FORMAT_CONFIGS[contentType as ContentType] || FORMAT_CONFIGS.longread;
};
