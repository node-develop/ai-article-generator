import 'dotenv/config';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth.js';
import { articlesRoutes } from './routes/articles.js';
import { promptsRoutes } from './routes/prompts.js';
import { generationsRoutes } from './routes/generations.js';
import { settingsRoutes } from './routes/settings.js';
import { statsRoutes } from './routes/stats.js';
import { usersRoutes } from './routes/users.js';
import { sseRoutes } from './realtime/sse.js';
import { createWsRoutes } from './realtime/ws.js';
import { requireAuth } from './auth/middleware.js';

const app = new Hono();

// Create WebSocket support for @hono/node-ws
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Build WS routes with the upgradeWebSocket helper
const wsRoutes = createWsRoutes(upgradeWebSocket);

// Global middleware
app.use('*', logger());
app.use('/api/*', cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.BETTER_AUTH_URL || 'http://localhost:3000')
    : 'http://localhost:3000',
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Serve uploaded images (no auth required for image assets)
app.use('/api/uploads/*', serveStatic({
  root: './uploads',
  rewriteRequestPath: (path) => path.replace(/^\/api\/uploads/, ''),
}));

// Auth routes (better-auth)
app.route('/api/auth', authRoutes);

// Auth middleware for protected API routes
app.use('/api/articles/*', requireAuth);
app.use('/api/prompts/*', requireAuth);
app.use('/api/generations/*', requireAuth);
app.use('/api/settings/*', requireAuth);
app.use('/api/stats/*', requireAuth);
app.use('/api/users/*', requireAuth);
app.use('/api/sse/*', requireAuth);

// API routes
app.route('/api/articles', articlesRoutes);
app.route('/api/prompts', promptsRoutes);
app.route('/api/generations', generationsRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/stats', statsRoutes);
app.route('/api/users', usersRoutes);

// Real-time
app.route('/api/sse', sseRoutes);
app.route('/api/ws', wsRoutes);

const port = Number(process.env.API_PORT) || 4000;

console.log(`Server starting on port ${port}...`);
const server = serve({ fetch: app.fetch, port });

// Inject WebSocket handling into the HTTP server
injectWebSocket(server);
