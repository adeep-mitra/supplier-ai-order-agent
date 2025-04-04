CREATE TABLE "gmail_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"scope" text,
	"token_type" text,
	"expiry_date" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gmail_access_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gmail_refresh_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gmail_token_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "gmail_tokens" ADD CONSTRAINT "gmail_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;