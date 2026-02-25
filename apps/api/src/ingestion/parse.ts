import { z } from 'zod';
import { readFileSync } from 'fs';

const rawArticleSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  date: z.string(),
  hubs: z.array(z.string()).default([]),
  text: z.string().min(50),
  char_count: z.number().optional(),
});

export type RawArticle = z.infer<typeof rawArticleSchema>;

export const parseJsonlFile = (filePath: string): RawArticle[] => {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  const articles: RawArticle[] = [];
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]);
      const validated = rawArticleSchema.parse(parsed);
      articles.push(validated);
    } catch (err: any) {
      errors.push(`Line ${i + 1}: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    console.warn(`Parse warnings (${errors.length}):`);
    errors.slice(0, 5).forEach((e) => console.warn(`  ${e}`));
    if (errors.length > 5) console.warn(`  ... and ${errors.length - 5} more`);
  }

  console.log(`Parsed ${articles.length} articles from ${filePath}`);
  return articles;
};
