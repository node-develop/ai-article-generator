import { createMiddleware } from 'hono/factory';
import { auth } from './index.js';

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
};

type AuthSession = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
};

// Declare Hono variable types
type AuthEnv = {
  Variables: {
    user: AuthUser;
    session: AuthSession;
  };
};

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', session.user as unknown as AuthUser);
  c.set('session', session.session as AuthSession);
  await next();
});

export const requireRole = (...roles: Array<'admin' | 'editor' | 'viewer'>) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
  });
