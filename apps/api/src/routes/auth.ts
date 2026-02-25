import { Hono } from 'hono';
import { auth } from '../auth/index.js';

export const authRoutes = new Hono();

// better-auth handles all auth routes: sign-in, sign-up, sign-out, session, etc.
authRoutes.all('/*', (c) => {
  return auth.handler(c.req.raw);
});
