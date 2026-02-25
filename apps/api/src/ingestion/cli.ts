import 'dotenv/config';
import { parseJsonlFile } from './parse.js';
import { cleanText } from './clean.js';
import { classifyArticle } from './classify.js';
import { chunkText } from './chunk.js';
import { embedTexts } from './embed.js';
import { db } from '../db/index.js';
import { articles, articleChunks } from '../db/schema.js';
import { eq, count, sql } from 'drizzle-orm';

const args = process.argv.slice(2);
const getArg = (name: string): string | undefined => {
  const idx = args.findIndex((a) => a.startsWith(`--${name}=`));
  if (idx >= 0) return args[idx].split('=')[1];
  const flagIdx = args.findIndex((a) => a === `--${name}`);
  if (flagIdx >= 0 && args[flagIdx + 1]) return args[flagIdx + 1];
  return undefined;
};

const mode = getArg('mode') || 'full';
const file = getArg('file') || 'raw-articles/selectel_habr_articles.jsonl';
const limit = Number(getArg('limit')) || 0;

const ingestFull = async () => {
  console.log(`\n=== Full Ingestion: ${file} ===\n`);

  let rawArticles = parseJsonlFile(file);
  if (limit > 0) {
    rawArticles = rawArticles.slice(0, limit);
    console.log(`Limited to first ${limit} articles`);
  }
  console.log(`Processing ${rawArticles.length} articles\n`);

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < rawArticles.length; i++) {
    const raw = rawArticles[i];
    console.log(`[${i + 1}/${rawArticles.length}] ${raw.title.slice(0, 60)}...`);

    // Check for duplicate
    const existing = await db.select({ id: articles.id })
      .from(articles)
      .where(eq(articles.sourceUrl, raw.url))
      .limit(1);

    if (existing.length > 0) {
      console.log('  Skipped (duplicate)');
      skipped++;
      continue;
    }

    // Clean
    const cleaned = cleanText(raw.text);
    console.log(`  Cleaned: ${raw.text.length} -> ${cleaned.length} chars`);

    // Classify
    const contentType = await classifyArticle(raw.title, cleaned);
    console.log(`  Type: ${contentType}`);

    // Store article
    const [article] = await db.insert(articles).values({
      sourceUrl: raw.url,
      title: raw.title,
      publishedAt: raw.date ? new Date(raw.date) : null,
      hubs: raw.hubs,
      rawText: raw.text,
      cleanText: cleaned,
      charCount: cleaned.length,
      contentType,
      isReference: true,
      metadata: {},
    }).returning();

    // Chunk
    const chunks = await chunkText(cleaned);
    console.log(`  Chunks: ${chunks.length}`);

    if (chunks.length === 0) continue;

    // Embed
    const chunkTexts = chunks.map((c) => c.text);
    let embeddings: number[][] = [];

    if (process.env.OPEN_ROUTER_API_KEY) {
      embeddings = await embedTexts(chunkTexts);
    } else {
      console.log('  Skipping embeddings (no OPEN_ROUTER_API_KEY)');
    }

    // Store chunks
    const chunkValues = chunks.map((chunk, idx) => ({
      articleId: article.id,
      chunkIndex: chunk.index,
      chunkText: chunk.text,
      embedding: embeddings[idx] || null,
      sectionTitle: chunk.sectionTitle,
      tokenCount: chunk.tokenCount,
    }));

    await db.insert(articleChunks).values(chunkValues);
    console.log(`  Stored article + ${chunks.length} chunks`);
    inserted++;
  }

  console.log(`\n=== Done: ${inserted} inserted, ${skipped} skipped ===\n`);
};

const ingestAdd = async () => {
  console.log(`\n=== Incremental Ingestion: ${file} ===\n`);
  // Same as full but only processes articles not already in DB
  await ingestFull();
};

const reindex = async () => {
  console.log('\n=== Reindexing: regenerating chunks + embeddings ===\n');

  // Delete all chunks
  await db.delete(articleChunks);
  console.log('Deleted all existing chunks');

  // Get all articles
  const allArticles = await db.select().from(articles);
  console.log(`Processing ${allArticles.length} articles\n`);

  for (let i = 0; i < allArticles.length; i++) {
    const article = allArticles[i];
    console.log(`[${i + 1}/${allArticles.length}] ${article.title.slice(0, 60)}...`);

    const chunks = await chunkText(article.cleanText);
    const chunkTexts = chunks.map((c) => c.text);

    let embeddings: number[][] = [];
    if (process.env.OPEN_ROUTER_API_KEY) {
      embeddings = await embedTexts(chunkTexts);
    }

    const chunkValues = chunks.map((chunk, idx) => ({
      articleId: article.id,
      chunkIndex: chunk.index,
      chunkText: chunk.text,
      embedding: embeddings[idx] || null,
      sectionTitle: chunk.sectionTitle,
      tokenCount: chunk.tokenCount,
    }));

    if (chunkValues.length > 0) {
      await db.insert(articleChunks).values(chunkValues);
    }
    console.log(`  ${chunks.length} chunks`);
  }

  console.log('\n=== Reindex complete ===\n');
};

const showStats = async () => {
  const [articleCount] = await db.select({ count: count() }).from(articles);
  const [chunkCount] = await db.select({ count: count() }).from(articleChunks);
  const [refCount] = await db.select({ count: count() }).from(articles).where(eq(articles.isReference, true));
  const [embeddedCount] = await db.select({ count: count() }).from(articleChunks).where(sql`${articleChunks.embedding} IS NOT NULL`);

  const typeStats = await db.select({
    contentType: articles.contentType,
    count: count(),
  }).from(articles).groupBy(articles.contentType);

  console.log('\n=== Ingestion Stats ===');
  console.log(`Articles:     ${articleCount.count}`);
  console.log(`  Reference:  ${refCount.count}`);
  console.log(`  Generated:  ${Number(articleCount.count) - Number(refCount.count)}`);
  console.log(`Chunks:       ${chunkCount.count}`);
  console.log(`  Embedded:   ${embeddedCount.count}`);
  console.log('\nBy content type:');
  for (const stat of typeStats) {
    console.log(`  ${stat.contentType}: ${stat.count}`);
  }
  console.log();
};

const run = async () => {
  switch (mode) {
    case 'full':
      await ingestFull();
      break;
    case 'add':
      await ingestAdd();
      break;
    case 'reindex':
      await reindex();
      break;
    case 'stats':
      await showStats();
      break;
    default:
      console.error(`Unknown mode: ${mode}`);
      process.exit(1);
  }
  process.exit(0);
};

run().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
