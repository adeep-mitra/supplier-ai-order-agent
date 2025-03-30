import { Hono } from 'hono';
import { google } from 'googleapis';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema';
import type { Env } from '../index'; // Adjust path if needed
import * as schema from '../db/schema';

export const gmailRoutes = new Hono<{ Bindings: Env }>();

// Step 1: Start Gmail OAuth
gmailRoutes.get('/auth/gmail', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = c.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return c.json({ error: 'Missing Google OAuth environment variables' }, 500);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });

  return c.redirect(authUrl);
});

// Step 2: Handle OAuth Callback
gmailRoutes.get('/auth/gmail/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.text('Missing code', 400);

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = c.env.GOOGLE_REDIRECT_URI;
  const dbUrl = c.env.DATABASE_URL;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const { data } = await oauth2.userinfo.get();
    const email = data.email;

    if (!email) return c.text('Failed to fetch user email', 500);

    const sql = postgres(dbUrl, { ssl: 'require' });
    const db = drizzle(sql, { schema });

    const existing = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!existing) {
      return c.text(`No user found with email ${email}`, 404);
    }

    await db.update(users).set({
      gmailAccessToken: tokens.access_token ?? null,
      gmailRefreshToken: tokens.refresh_token ?? null,
      gmailTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    }).where(eq(users.id, existing.id));

    return c.text(`Successfully connected Gmail for ${email}`);
  } catch (err) {
    console.error('[OAuth Callback Error]', err);
    return c.text('OAuth flow failed', 500);
  }
});
