import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, or, and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import * as schema from './db/schema';

export type Env = {
  DATABASE_URL: string;
};

type Variables = {
  db: PostgresJsDatabase<typeof schema>;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Shared init (can be reused across requests)
app.use(async (c, next) => {
  const dbUrl = c.env.DATABASE_URL;
  const sql = postgres(dbUrl, { ssl: 'require' });
  c.set('db', drizzle(sql, { schema }));
  await next();
});

// Start conversation
app.post('/start', async (c) => {
  const { input, supplierId } = await c.req.json(); // input can be phone or email
  const db = c.get('db');

  // 1. Find restaurant by email or phone
  const restaurant = await db.query.users.findFirst({
    where: or(
      eq(schema.users.email, input),
      eq(schema.users.contactPhone, input),
      eq(schema.users.businessPhone, input)
    ),
  });

  if (!restaurant) {
    return c.json({ message: 'Restaurant not found.' }, 404);
  }

  // 2. Check if partnered with the given supplier
  const partnership = await db.query.partnerships.findFirst({
    where: and(
      eq(schema.partnerships.restaurantId, restaurant.id),
      eq(schema.partnerships.supplierId, supplierId)
    ),
  });

  if (!partnership) {
    return c.json({ message: 'This restaurant is not partnered with the supplier.' }, 403);
  }

  // 3. Load items available to that restaurant (from the supplier)
  const availableItems = await db.query.items.findMany({
    where: eq(schema.items.supplierId, supplierId),
  });

  // 4. Respond with items and confirmation
  return c.json({
    message: 'Restaurant and partnership verified.',
    restaurant,
    items: availableItems,
    next: 'Please enter your next message (e.g. your order).',
  });
});

export default app;