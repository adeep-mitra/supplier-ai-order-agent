// index.ts
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, ilike, and } from 'drizzle-orm';
import { orders, orderItems, parLevels, parLevelItems, gmailTokens } from './db/schema';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './db/schema';
import { google } from 'googleapis';
import { gmailRoutes } from './routes/gmail'; // adjust path if needed
import { fetchGmailRoute } from './routes/gmail/fetch'; // adjust path as needed
import { processGmailRoute, handler } from './routes/gmail/process'; // ✅ correct import path
import { parseOrderTextWithOpenAI } from './aiOrder';
import type { ScheduledEvent } from '@cloudflare/workers-types';

export type Env = {
  DATABASE_URL: string;
  OPENAI_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
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
    const insertedItems: Array<{ name: string; quantity: number }> = [];
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

      insertedItems.push({ name: foundItem.name ?? '(unknown)', quantity: ci.quantity });
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

// Gmail authentication route

// Then define the callback route separately
app.get('/auth/gmail/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json({ error: 'Missing code' }, 400);

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = c.env.GOOGLE_REDIRECT_URI;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const idInfo = await oauth2Client.getTokenInfo(tokens.access_token!);
    const email = idInfo.email;

    if (!email) return c.json({ error: 'Unable to get user email' }, 500);

    const db = c.get('db');
    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // ✅ Save tokens directly into `users` table (snake_case fields)
    await db.update(schema.users).set({
      gmailAccessToken: tokens.access_token ?? null,
      gmailRefreshToken: tokens.refresh_token ?? null,
      gmailTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    }).where(eq(schema.users.id, user.id));    

    return c.json({ success: true, message: 'Gmail connected' });
  } catch (err) {
    console.error('[Gmail Auth Error]', err);
    return c.json({ error: 'Failed to authenticate Gmail' }, 500);
  }
});

// Handle scheduled event for cron
export async function scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  const db = drizzle(postgres(env.DATABASE_URL, { ssl: 'require' }), { schema });
  
  // Create a context object that matches the handler's expected type
  const context = {
    env,
    get: (key: 'db') => db,
    json: (body: any, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  };

  return await handler(context as any);
}

app.route('/', gmailRoutes);
app.route('/', fetchGmailRoute);
app.route('/', processGmailRoute);

export default {
  fetch: app.fetch,
  scheduled,
};
