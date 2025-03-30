// index.ts
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, ilike, and } from 'drizzle-orm';
import { orders, orderItems } from './db/schema';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './db/schema';

// Import the AI logic from the new file
import { parseOrderTextWithOpenAI } from './aiOrder';

export type Env = {
  DATABASE_URL: string;
  OPENAI_KEY: string;
};

type Variables = {
  db: PostgresJsDatabase<typeof schema>;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Middleware to set up Drizzle
app.use(async (c, next) => {
  const dbUrl = c.env.DATABASE_URL;
  const sql = postgres(dbUrl, { ssl: 'require' });
  c.set('db', drizzle(sql, { schema }));
  await next();
});

// AI-based order route
app.post('/ai-order', async (c) => {
  try {
    const { restaurantId, supplierId, orderText } = await c.req.json();
    console.log('[Request]', { restaurantId, supplierId, orderText });

    const db = c.get('db');
    const openAiKey = c.env.OPENAI_KEY;

    if (!openAiKey) {
      console.error('Missing OPENAI_KEY');
      return c.json({ error: 'Missing OPENAI_KEY env var' }, 500);
    }

    // Step 1: Parse the order text
    let parsed;
    try {
      parsed = await parseOrderTextWithOpenAI(orderText, openAiKey);
      console.log('[Parsed]', parsed);
    } catch (err) {
      console.error('[AI Parse Error]', err);
      return c.json({ error: err instanceof Error ? err.message : 'Unknown AI parse error' }, 500);
    }

    // Step 2: Create the order
    const [newOrder] = await db
      .insert(orders)
      .values({
        restaurantId,
        supplierId,
        type: 'DRAFT',
        status: 'NOT_APPLICABLE',
        notes: orderText,
      })
      .returning({ id: orders.id });

    // Step 3: Match and insert items
    const insertedItems = [];
    for (const i of parsed.items) {
      const foundItem = await db.query.items.findFirst({
        where: and(
          ilike(schema.items.name, `%${i.name}%`),
          eq(schema.items.supplierId, supplierId)
        ),
      });

      console.log(`[Item Match] Looking for: ${i.name}`, foundItem);

      if (!foundItem?.name) continue;

      await db.insert(orderItems).values({
        orderId: newOrder.id,
        itemId: foundItem.id,
        quantity: i.quantity,
      });

      insertedItems.push({ name: foundItem.name, quantity: i.quantity });
    }

    const finalOrderItems = await db.query.orderItems.findMany({
      where: eq(orderItems.orderId, newOrder.id),
    });

    return c.json({
      message: 'Order created successfully via AI parse',
      orderId: newOrder.id,
      recognizedItems: insertedItems,
      finalOrderItems,
    });
  } catch (err) {
    console.error('[Unhandled Error]', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
