import { Hono } from 'hono';
import { google } from 'googleapis';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and } from 'drizzle-orm';
import { users, partnerships, gmailTokens } from '../../db/schema';
import type { Env } from '../../index';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';

type Variables = {
  db: PostgresJsDatabase<typeof schema>;
};

export const fetchGmailRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

fetchGmailRoute.get('/gmail/fetch', async (c) => {
  const db = c.get('db') as PostgresJsDatabase<typeof schema>;

  const supplierEmail = 'adeep@polinate.com.au'; // replace with auth in production
  
  const supplier = await db.query.users.findFirst({
    where: eq(users.email, supplierEmail),
  });
  if (!supplier) return c.json({ error: 'Supplier not found' }, 404);
  
  if (!supplier.gmailAccessToken || !supplier.gmailRefreshToken) {
    return c.json({ error: 'No Gmail token found for supplier' }, 404);
  }
  
  const oauth2Client = new google.auth.OAuth2(
    c.env.GOOGLE_CLIENT_ID,
    c.env.GOOGLE_CLIENT_SECRET,
    c.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: supplier.gmailAccessToken,
    refresh_token: supplier.gmailRefreshToken,
    expiry_date: supplier.gmailTokenExpiry?.getTime(),
  });  

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const { data } = await gmail.users.messages.list({ userId: 'me', maxResults: 5 });
  const messages = data.messages ?? [];

  const results = [];
  for (const msg of messages) {
    const full = await gmail.users.messages.get({ userId: 'me', id: msg.id! });
    const fromHeader = full.data.payload?.headers?.find((h) => h.name === 'From');
    const fromEmail = fromHeader?.value?.match(/<(.*?)>/)?.[1] || fromHeader?.value;

    if (!fromEmail) continue;

    const restaurant = await db.query.users.findFirst({
      where: eq(users.email, fromEmail),
    });
    if (!restaurant) continue;

    const isPartnered = await db.query.partnerships.findFirst({
      where: and(
        eq(partnerships.supplierId, supplier.id),
        eq(partnerships.restaurantId, restaurant.id),
        eq(partnerships.status, 'ACTIVE')
      ),
    });

    if (!isPartnered) continue;

    results.push({
      subject: full.data.payload?.headers?.find((h) => h.name === 'Subject')?.value,
      from: fromEmail,
      snippet: full.data.snippet,
    });
  }

  return c.json({ messages: results });
});