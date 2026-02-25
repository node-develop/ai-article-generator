import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  integer,
  decimal,
  bigint,
  jsonb,
  index,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { StyleMetrics, StyleQualitative, StyleStructural } from '../ingestion/style-types.js';

// ── users ─────────────────────────────────────────────────
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  role: text('role').$type<'admin' | 'editor' | 'viewer'>().default('editor').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── sessions ──────────────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── accounts ──────────────────────────────────────────────
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── verification ──────────────────────────────────────────
export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── articles ──────────────────────────────────────────────
export const articles = pgTable('articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceUrl: text('source_url').unique(),
  title: text('title').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  hubs: text('hubs').array(),
  rawText: text('raw_text').notNull(),
  cleanText: text('clean_text').notNull(),
  charCount: integer('char_count'),
  contentType: text('content_type').$type<'review' | 'tutorial' | 'longread' | 'news' | 'digest'>().notNull(),
  metadata: jsonb('metadata').default({}),
  isReference: boolean('is_reference').default(true).notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── article_chunks ────────────────────────────────────────
export const articleChunks = pgTable('article_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  chunkText: text('chunk_text').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  sectionTitle: text('section_title'),
  tokenCount: integer('token_count'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
  index('article_chunks_article_id_idx').on(table.articleId),
]);

// ── article_style_profiles ────────────────────────────────
export const articleStyleProfiles = pgTable('article_style_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }).unique(),
  contentType: text('content_type').$type<'review' | 'tutorial' | 'longread' | 'news' | 'digest'>().notNull(),
  metrics: jsonb('metrics').$type<StyleMetrics>().notNull(),
  qualitative: jsonb('qualitative').$type<StyleQualitative>(),
  structural: jsonb('structural').$type<StyleStructural>(),
  modelUsed: text('model_used'),
  version: integer('version').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('style_profiles_content_type_idx').on(table.contentType),
  index('style_profiles_article_id_idx').on(table.articleId),
]);

// ── prompts ───────────────────────────────────────────────
export const prompts = pgTable('prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  stage: text('stage').notNull(),
  contentType: text('content_type').$type<'review' | 'tutorial' | 'longread' | 'news' | 'digest'>(),
  name: text('name').notNull(),
  template: text('template').notNull(),
  version: integer('version').default(1).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('prompts_stage_version_ct_idx').on(table.stage, table.version, table.contentType),
]);

// ── generation_runs ───────────────────────────────────────
export const generationRuns = pgTable('generation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id),
  topic: text('topic').notNull(),
  contentType: text('content_type').$type<'review' | 'tutorial' | 'longread' | 'news' | 'digest'>().default('longread').notNull(),
  inputUrls: text('input_urls').array(),
  companyLinks: text('company_links').array(),
  targetKeywords: text('target_keywords').array(),
  enableReview: boolean('enable_review').default(false).notNull(),
  status: text('status').$type<'pending' | 'research' | 'rag_context' | 'build_style_guide' | 'outline' | 'outline_review' | 'writing' | 'editing' | 'edit_review' | 'images' | 'assembling' | 'completed' | 'failed'>().default('pending').notNull(),
  currentStage: text('current_stage'),
  resultArticleId: uuid('result_article_id').references(() => articles.id),
  langsmithTraceUrl: text('langsmith_trace_url'),
  stagesLog: jsonb('stages_log').default([]),
  errorMessage: text('error_message'),
  totalTokens: integer('total_tokens').default(0).notNull(),
  totalCostUsd: decimal('total_cost_usd', { precision: 10, scale: 4 }).default('0').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('generation_runs_user_id_idx').on(table.userId),
  index('generation_runs_status_idx').on(table.status),
]);

// ── generated_images ──────────────────────────────────────
export const generatedImages = pgTable('generated_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => generationRuns.id, { onDelete: 'cascade' }),
  promptUsed: text('prompt_used').notNull(),
  imageUrl: text('image_url').notNull(),
  position: text('position'),
  width: integer('width'),
  height: integer('height'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── user_stats_cache ──────────────────────────────────────
export const userStatsCache = pgTable('user_stats_cache', {
  userId: text('user_id').primaryKey().references(() => users.id),
  totalGenerations: integer('total_generations').default(0).notNull(),
  completedGenerations: integer('completed_generations').default(0).notNull(),
  failedGenerations: integer('failed_generations').default(0).notNull(),
  totalArticles: integer('total_articles').default(0).notNull(),
  totalTokensUsed: bigint('total_tokens_used', { mode: 'number' }).default(0).notNull(),
  totalCostUsd: decimal('total_cost_usd', { precision: 12, scale: 4 }).default('0').notNull(),
  lastGenerationAt: timestamp('last_generation_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── settings ──────────────────────────────────────────────
export const settings = pgTable('settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  value: jsonb('value').notNull(),
  updatedBy: text('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Relations ─────────────────────────────────────────────
export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  articles: many(articles),
  generationRuns: many(generationRuns),
  prompts: many(prompts),
  statsCache: one(userStatsCache, { fields: [users.id], references: [userStatsCache.userId] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const articlesRelations = relations(articles, ({ many, one }) => ({
  chunks: many(articleChunks),
  styleProfile: one(articleStyleProfiles, { fields: [articles.id], references: [articleStyleProfiles.articleId] }),
  createdByUser: one(users, { fields: [articles.createdBy], references: [users.id] }),
}));

export const articleChunksRelations = relations(articleChunks, ({ one }) => ({
  article: one(articles, { fields: [articleChunks.articleId], references: [articles.id] }),
}));

export const articleStyleProfilesRelations = relations(articleStyleProfiles, ({ one }) => ({
  article: one(articles, { fields: [articleStyleProfiles.articleId], references: [articles.id] }),
}));

export const generationRunsRelations = relations(generationRuns, ({ one, many }) => ({
  user: one(users, { fields: [generationRuns.userId], references: [users.id] }),
  resultArticle: one(articles, { fields: [generationRuns.resultArticleId], references: [articles.id] }),
  images: many(generatedImages),
}));

export const generatedImagesRelations = relations(generatedImages, ({ one }) => ({
  run: one(generationRuns, { fields: [generatedImages.runId], references: [generationRuns.id] }),
}));

export const promptsRelations = relations(prompts, ({ one }) => ({
  createdByUser: one(users, { fields: [prompts.createdBy], references: [users.id] }),
}));
