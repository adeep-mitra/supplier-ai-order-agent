import { Hono } from 'hono';
import { google } from 'googleapis';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, ilike } from 'drizzle-orm';
import { users, partnerships, orders, orderItems } from '../../db/schema';
import type { Env } from '../../index';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';
import { parseOrderTextWithOpenAI } from '../../aiOrder';

type Variables = {
  db: PostgresJsDatabase<typeof schema>;
};

export const processGmailRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

processGmailRoute.get('/gmail/process', async (c) => {
  const db = c.get('db');

  const supplierEmail = 'adeep@polinate.com.au'; // TODO: Replace with auth

  const supplier = await db.query.users.findFirst({ where: eq(users.email, supplierEmail) });
  if (!supplier) return c.json({ error: 'Supplier not found' }, 404);

  const oauth2Client = new google.auth.OAuth2(
    c.env.GOOGLE_CLIENT_ID,
    c.env.GOOGLE_CLIENT_SECRET,
    c.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: supplier.gmailAccessToken ?? undefined,
    refresh_token: supplier.gmailRefreshToken ?? undefined,
    expiry_date: supplier.gmailTokenExpiry?.getTime(),
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Get or create the processed-by-agent label
  let processedLabelId: string;
  try {
    const labelsRes = await gmail.users.labels.list({ userId: 'me' });
    const processedLabel = labelsRes.data.labels?.find(l => l.name === 'processed-by-agent');
    
    if (!processedLabel) {
      const createRes = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: 'processed-by-agent',
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });
      processedLabelId = createRes.data.id!;
    } else {
      processedLabelId = processedLabel.id!;
    }
  } catch (err) {
    console.error('Failed to get/create processed label:', err);
    return c.json({ error: 'Failed to setup Gmail labels' }, 500);
  }

  // Fetch unprocessed emails
  const { data } = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 5,
    q: `-label:${processedLabelId}`,
  });
  const messages = data.messages ?? [];

  const results = [];

  for (const msg of messages) {
    const full = await gmail.users.messages.get({ userId: 'me', id: msg.id! });
    const headers = full.data.payload?.headers ?? [];
    const fromHeader = headers.find((h) => h.name === 'From');
    const subject = headers.find((h) => h.name === 'Subject')?.value;
    const snippet = full.data.snippet;
    const fromEmail = fromHeader?.value?.match(/<(.*?)>/)?.[1] || fromHeader?.value;

    if (!fromEmail) continue;

    const restaurant = await db.query.users.findFirst({
      where: eq(users.email, fromEmail),
    });
    if (!restaurant) continue;
    
    const partnership = await db.query.partnerships.findFirst({
      where: and(
        eq(partnerships.supplierId, supplier.id),
        eq(partnerships.restaurantId, restaurant.id),
        eq(partnerships.status, 'ACTIVE')
      ),
    });
    if (!partnership) continue;

    console.log(`[PROCESSING] Email from ${fromEmail}: "${snippet}"`);

    const parsed = await parseOrderTextWithOpenAI(snippet || '', c.env.OPENAI_KEY);
    if (!parsed.items.length) {
      console.log('[SKIPPED] No items parsed from email.');
      continue;
    }

    const [newOrder] = await db.insert(orders).values({
      restaurantId: partnership.restaurantId,
      supplierId: supplier.id,
      type: 'DRAFT',
      status: 'NOT_APPLICABLE',
      notes: snippet,
    }).returning({ id: orders.id });

    for (const item of parsed.items) {
      const foundItem = await db.query.items.findFirst({
        where: and(
          eq(schema.items.supplierId, supplier.id),
          ilike(schema.items.name, `%${item.name}%`)
        ),
      });
      if (!foundItem) {
        console.log(`[MISSING ITEM] Could not find item: ${item.name}`);
        continue;
      }

      await db.insert(orderItems).values({
        orderId: newOrder.id,
        itemId: foundItem.id,
        quantity: item.quantity,
      });
    }

    // Mark email as processed
    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: msg.id!,
        requestBody: {
          addLabelIds: [processedLabelId],
        },
      });
    } catch (err) {
      console.error('Failed to mark email as processed:', err);
    }

    results.push({
      from: fromEmail,
      subject,
      snippet,
      orderCreated: true,
      orderId: newOrder.id,
    });
  }

  return c.json({ processed: results });
});
