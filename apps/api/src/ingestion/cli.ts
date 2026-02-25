import 'dotenv/config';
import { parseJsonlFile } from './parse.js';
import { cleanText } from './clean.js';
import { classifyArticle } from './classify.js';
import { chunkText } from './chunk.js';
import { embedTexts } from './embed.js';
import { db } from '../db/index.js';
import { articles, articleChunks, articleStyleProfiles } from '../db/schema.js';
import { eq, count, sql, isNull } from 'drizzle-orm';
import { computeStyleMetrics } from './analyze-metrics.js';

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
  const [profileCount] = await db.select({ count: count() }).from(articleStyleProfiles);
  const [qualitativeCount] = await db.select({ count: count() }).from(articleStyleProfiles).where(sql`${articleStyleProfiles.qualitative} IS NOT NULL`);

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
  console.log(`Style profiles: ${profileCount.count}`);
  console.log(`  With qualitative: ${qualitativeCount.count}`);
  console.log('\nBy content type:');
  for (const stat of typeStats) {
    console.log(`  ${stat.contentType}: ${stat.count}`);
  }
  console.log();
};

const computeMetricsMode = async () => {
  console.log('\n=== Computing Style Metrics ===\n');

  const allArticles = await db.select({
    id: articles.id,
    title: articles.title,
    cleanText: articles.cleanText,
    contentType: articles.contentType,
  }).from(articles).where(eq(articles.isReference, true));

  console.log(`Found ${allArticles.length} reference articles\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < allArticles.length; i++) {
    const article = allArticles[i];
    console.log(`[${i + 1}/${allArticles.length}] ${article.title.slice(0, 60)}...`);

    const metrics = computeStyleMetrics(article.cleanText);

    // Check if profile already exists
    const [existing] = await db.select({ id: articleStyleProfiles.id })
      .from(articleStyleProfiles)
      .where(eq(articleStyleProfiles.articleId, article.id))
      .limit(1);

    if (existing) {
      await db.update(articleStyleProfiles)
        .set({ metrics, contentType: article.contentType as any })
        .where(eq(articleStyleProfiles.id, existing.id));
      updated++;
    } else {
      await db.insert(articleStyleProfiles).values({
        articleId: article.id,
        contentType: article.contentType as any,
        metrics,
      });
      created++;
    }

    console.log(`  avgSentLen=${metrics.avgSentenceLength} vocabRich=${metrics.vocabularyRichness} techDensity=${metrics.technicalTermDensity}`);
  }

  console.log(`\n=== Done: ${created} created, ${updated} updated, ${skipped} skipped ===\n`);
};

const analyzeStyleMode = async () => {
  console.log('\n=== Analyzing Style (LLM-based) ===\n');

  const { analyzeStyleQualitative } = await import('./analyze-qualitative.js');

  // Find profiles that have metrics but no qualitative analysis
  const profiles = await db.select({
    profileId: articleStyleProfiles.id,
    articleId: articleStyleProfiles.articleId,
    contentType: articleStyleProfiles.contentType,
    title: articles.title,
    cleanText: articles.cleanText,
  })
    .from(articleStyleProfiles)
    .innerJoin(articles, eq(articleStyleProfiles.articleId, articles.id))
    .where(isNull(articleStyleProfiles.qualitative));

  const batchLimit = Number(getArg('batch')) || profiles.length;
  const toProcess = profiles.slice(0, batchLimit);

  console.log(`Found ${profiles.length} profiles without qualitative analysis (processing ${toProcess.length})\n`);

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const profile = toProcess[i];
    console.log(`[${i + 1}/${toProcess.length}] ${profile.title.slice(0, 60)}...`);

    try {
      const { qualitative, structural } = await analyzeStyleQualitative(
        profile.title,
        profile.cleanText,
        profile.contentType,
      );

      await db.update(articleStyleProfiles)
        .set({ qualitative, structural, modelUsed: 'openai/gpt-4o-mini' })
        .where(eq(articleStyleProfiles.id, profile.profileId));

      console.log(`  tone: ${qualitative.toneDescription.slice(0, 80)}...`);
      processed++;
    } catch (err) {
      console.error(`  FAILED: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\n=== Done: ${processed} analyzed, ${failed} failed ===\n`);
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
    case 'compute-metrics':
      await computeMetricsMode();
      break;
    case 'analyze-style':
      await analyzeStyleMode();
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
