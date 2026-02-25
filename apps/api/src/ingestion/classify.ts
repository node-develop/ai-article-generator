import type { ContentType } from '@articleforge/shared';

// Simple heuristic classifier (fallback when no API key)
const classifyByHeuristic = (title: string, text: string): ContentType => {
  const combined = `${title} ${text}`.toLowerCase();

  if (combined.includes('обзор') || combined.includes('review') || combined.includes('подборк') || combined.includes('сравнен')) {
    return 'review';
  }
  if (combined.includes('руководство') || combined.includes('tutorial') || combined.includes('как настроить') || combined.includes('гайд') || combined.includes('инструкц') || combined.includes('пошагов')) {
    return 'tutorial';
  }
  if (combined.includes('новост') || combined.includes('релиз') || combined.includes('обновлен') || combined.includes('выпуск')) {
    return 'news';
  }
  return 'longread';
};

export const classifyArticle = async (title: string, text: string): Promise<ContentType> => {
  const apiKey = process.env.OPEN_ROUTER_API_KEY;

  if (!apiKey) {
    return classifyByHeuristic(title, text);
  }

  try {
    const { createFastModel } = await import('../lib/openrouter.js');
    const model = createFastModel({ temperature: 0, maxTokens: 10 });

    const response = await model.invoke([
      {
        role: 'system',
        content: 'Classify the article into one category. Reply with ONLY one word: review, tutorial, longread, or news.',
      },
      {
        role: 'user',
        content: `Title: ${title}\n\nText (first 500 chars): ${text.slice(0, 500)}`,
      },
    ]);

    const result = String(response.content).trim().toLowerCase();
    if (['review', 'tutorial', 'longread', 'news'].includes(result)) {
      return result as ContentType;
    }
    return classifyByHeuristic(title, text);
  } catch (err) {
    console.warn('Classification API failed, using heuristic:', (err as Error).message);
    return classifyByHeuristic(title, text);
  }
};

export const classifyBatch = async (articles: Array<{ title: string; text: string }>): Promise<ContentType[]> => {
  const results: ContentType[] = [];
  for (const article of articles) {
    results.push(await classifyArticle(article.title, article.text));
  }
  return results;
};
