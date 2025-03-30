// index.ts
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, ilike, and } from 'drizzle-orm';
import { orders, orderItems, parLevels, parLevelItems } from './db/schema';
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

    // 1. Parse user text with AI
    let parsed;
    try {
      parsed = await parseOrderTextWithOpenAI(orderText, openAiKey);
      console.log('[Parsed]', parsed);
    } catch (err) {
      console.error('[AI Parse Error]', err);
      return c.json({ error: err instanceof Error ? err.message : 'Unknown AI parse error' }, 500);
    }

    // Make sure we have a boolean useParLevel
    // If not provided, default to false
    if (typeof parsed.useParLevel !== 'boolean') {
      parsed.useParLevel = false;
    }

    // 2. If AI says useParLevel, fetch par-level items
    let parLevelItemsArr: Array<{ name: string; quantity: number }> = [];
    if (parsed.useParLevel) {
      const existingPar = await db.query.parLevels.findFirst({
        where: and(
          eq(schema.parLevels.restaurantId, restaurantId),
          eq(schema.parLevels.supplierId, supplierId)
        ),
      });
      if (existingPar) {
        const rawParItems = await db.query.parLevelItems.findMany({
          where: eq(schema.parLevelItems.parLevelId, existingPar.id),
          with: { item: true }
        }) as Array<{ item: { name: string | null }, quantity: number | null }>;
        parLevelItemsArr = rawParItems.map((pi) => ({
          name: pi.item.name ?? '(unknown)',
          quantity: pi.quantity ?? 0,
        }));
      }
    }

    // 3. Combine par-level items + AI items
    //    (The AI items in parsed.items are the extra items)
    const combinedItems: Array<{ name: string; quantity: number }> = [
      ...parLevelItemsArr,
      ...parsed.items,
    ];

    // 4. Create a new order
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

    // 5. Match and insert combined items
    const insertedItems = [];
    for (const ci of combinedItems) {
      const foundItem = await db.query.items.findFirst({
        where: and(
          ilike(schema.items.name, `%${ci.name}%`),
          eq(schema.items.supplierId, supplierId)
        ),
      });

      console.log(`[Item Match] Looking for: ${ci.name}`, foundItem);

      if (!foundItem?.id) continue;

      await db.insert(orderItems).values({
        orderId: newOrder.id,
        itemId: foundItem.id,
        quantity: ci.quantity,
      });

      insertedItems.push({ name: foundItem.name, quantity: ci.quantity });
    }

    return c.json({
      message: parsed.useParLevel
        ? 'Order created with Par Level + extras'
        : 'Order created via AI parse',
      orderId: newOrder.id,
      recognizedItems: insertedItems,
    });
  } catch (err) {
    console.error('[Unhandled Error]', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
