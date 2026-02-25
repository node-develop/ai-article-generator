import { Hono } from 'hono';
import { toSnakeKeys } from '../utils/serialize.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
};

export const usersRoutes = new Hono();

usersRoutes.get('/', async (c) => {
  const user = c.get('user' as never) as AuthUser;
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin only' }, 403);
  }

  const data = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    createdAt: users.createdAt,
  }).from(users);

  return c.json({ data: data.map(d => toSnakeKeys(d)) });
});

usersRoutes.put('/:id/role', async (c) => {
  const currentUser = c.get('user' as never) as AuthUser;
  if (currentUser.role !== 'admin') {
    return c.json({ error: 'Admin only' }, 403);
  }

  const id = c.req.param('id');
  const body = await c.req.json();
  const { role } = body;

  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return c.json({ error: 'Invalid role' }, 400);
  }

  const [updated] = await db.update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

  if (!updated) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(toSnakeKeys(updated));
});

usersRoutes.post('/invite', async (c) => {
  return c.json({ error: 'Invite not implemented yet' }, 501);
});
