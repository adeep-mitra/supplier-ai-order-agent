import { pgTable, serial, text, varchar, integer, timestamp, boolean, numeric, uuid, pgEnum } from 'drizzle-orm/pg-core';
import { InferSelectModel, sql } from 'drizzle-orm';

// Enums
export const OrderType = pgEnum('order_type', ['DRAFT', 'PENDING', 'DELETED', 'ACTIVE', 'ARCHIVED']);
export const OrderStatus = pgEnum('order_status', ['ACCEPTED', 'FULFILLED', 'DELIVERED', 'NOT_APPLICABLE']);
export const ItemStatus = pgEnum('item_status', ['ACTIVE', 'DRAFT', 'ARCHIVED', 'DELETED']);
export const PartnershipStatus = pgEnum('partnership_status', ['ACTIVE', 'DELETED']);

// Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessName: varchar('business_name', { length: 255 }),
  contactName: varchar('contact_name', { length: 255 }),
  email: varchar('email', { length: 255 }).unique(),
  businessPhone: varchar('business_phone', { length: 50 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  addressLine1: text('address_line_1'),
  addressLine2: text('address_line_2'),
  state: varchar('state', { length: 100 }),
  postcode: varchar('postcode', { length: 20 }),
  logoUrl: text('logo_url'),
  abn: varchar('abn', { length: 20 }),
  isSupplier: boolean('is_supplier').default(false),
  role: varchar('role', { length: 50 }).default('USER'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  loggedInLast: timestamp('logged_in_last'),
});
export type User = InferSelectModel<typeof users>;

// Items
export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  supplierId: uuid('supplier_id').references(() => users.id),
  sku: varchar('sku', { length: 100 }),
  name: varchar('name', { length: 255 }),
  price: numeric('price', { precision: 10, scale: 2 }),
  unit: varchar('unit', { length: 50 }),
  description: text('description'),
  status: ItemStatus('status'),
});
export type Item = InferSelectModel<typeof items>;

// Orders
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  restaurantId: uuid('restaurant_id').references(() => users.id),
  supplierId: uuid('supplier_id').references(() => users.id),
  type: OrderType('type'),
  status: OrderStatus('status').default('NOT_APPLICABLE'),
  notes: text('notes'),
  cancelled: boolean('cancelled').default(false),
  disputed: boolean('disputed').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  lastUpdated: timestamp('last_updated').defaultNow().$onUpdateFn(() => sql`now()`),
  expectedDeliveryDateTime: timestamp('expected_delivery_date_time'),
  finalDeliveryDateTime: timestamp('final_delivery_date_time'),
});
export type Order = InferSelectModel<typeof orders>;

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id),
  itemId: integer('item_id').references(() => items.id),
  quantity: integer('quantity'),
});
export type OrderItem = InferSelectModel<typeof orderItems>;

export const orderHistory = pgTable('order_history', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id),
  status: OrderStatus('status'),
  type: OrderType('type'),
  changedAt: timestamp('changed_at').defaultNow(),
});
export type OrderHistory = InferSelectModel<typeof orderHistory>;

// Par Levels
export const parLevels = pgTable('par_levels', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  restaurantId: uuid('restaurant_id').references(() => users.id),
  supplierId: uuid('supplier_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});
export type ParLevel = InferSelectModel<typeof parLevels>;

export const parLevelItems = pgTable('par_level_items', {
  id: serial('id').primaryKey(),
  parLevelId: integer('par_level_id').references(() => parLevels.id),
  itemId: integer('item_id').references(() => items.id),
  quantity: integer('quantity'),
});
export type ParLevelItem = InferSelectModel<typeof parLevelItems>;

// Partnerships
export const partnerships = pgTable('partnerships', {
  id: serial('id').primaryKey(),
  restaurantId: uuid('restaurant_id').references(() => users.id),
  supplierId: uuid('supplier_id').references(() => users.id),
  status: PartnershipStatus('status').default('ACTIVE'),
  createdAt: timestamp('created_at').defaultNow(),
});
export type Partnership = InferSelectModel<typeof partnerships>;
