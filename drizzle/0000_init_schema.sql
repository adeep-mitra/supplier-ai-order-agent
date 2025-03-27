CREATE TYPE "public"."item_status" AS ENUM('ACTIVE', 'DRAFT', 'ARCHIVED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('ACCEPTED', 'FULFILLED', 'DELIVERED', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('DRAFT', 'PENDING', 'DELETED', 'ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."partnership_status" AS ENUM('ACTIVE', 'DELETED');--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" uuid,
	"sku" varchar(100),
	"name" varchar(255),
	"price" numeric(10, 2),
	"unit" varchar(50),
	"description" text,
	"status" "item_status"
);
--> statement-breakpoint
CREATE TABLE "order_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"status" "order_status",
	"type" "order_type",
	"changed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"item_id" integer,
	"quantity" integer
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"restaurant_id" uuid,
	"supplier_id" uuid,
	"type" "order_type",
	"status" "order_status" DEFAULT 'NOT_APPLICABLE',
	"notes" text,
	"cancelled" boolean DEFAULT false,
	"disputed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"last_updated" timestamp DEFAULT now(),
	"expected_delivery_date_time" timestamp,
	"final_delivery_date_time" timestamp
);
--> statement-breakpoint
CREATE TABLE "par_level_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"par_level_id" integer,
	"item_id" integer,
	"quantity" integer
);
--> statement-breakpoint
CREATE TABLE "par_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"restaurant_id" uuid,
	"supplier_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "partnerships" (
	"id" serial PRIMARY KEY NOT NULL,
	"restaurant_id" uuid,
	"supplier_id" uuid,
	"status" "partnership_status" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" varchar(255),
	"contact_name" varchar(255),
	"email" varchar(255),
	"business_phone" varchar(50),
	"contact_phone" varchar(50),
	"address_line_1" text,
	"address_line_2" text,
	"state" varchar(100),
	"postcode" varchar(20),
	"logo_url" text,
	"abn" varchar(20),
	"is_supplier" boolean DEFAULT false,
	"role" varchar(50) DEFAULT 'USER',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"logged_in_last" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_history" ADD CONSTRAINT "order_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "par_level_items" ADD CONSTRAINT "par_level_items_par_level_id_par_levels_id_fk" FOREIGN KEY ("par_level_id") REFERENCES "public"."par_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "par_level_items" ADD CONSTRAINT "par_level_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "par_levels" ADD CONSTRAINT "par_levels_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "par_levels" ADD CONSTRAINT "par_levels_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;