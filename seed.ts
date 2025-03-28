import dotenv from 'dotenv';
dotenv.config({ path: './.dev.vars' });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { users, items, orders, orderItems, orderHistory, parLevels, parLevelItems, partnerships, OrderType, OrderStatus, ItemStatus, PartnershipStatus } from "./src/db/schema";
import type { InferSelectModel } from "drizzle-orm";

// You may want to load from a .env or .dev.vars
// so ensure you have something like:
// DATABASE_URL=postgresql://user:password@host/db
// Then run: npx tsx seed.ts

const sql = postgres(process.env.DATABASE_URL || "", {
  ssl: "require",
});

const db = drizzle(sql);

async function main() {
  // --- 1) Create Suppliers --- //
  const [freshProduceCo, beveragesCo] = await db.insert(users).values([
    {
      businessName: "Fresh Produce Co.",
      contactName: "John Doe",
      email: "john@freshproduce.com",
      businessPhone: "(02) 1234 5678",
      contactPhone: "0400 111 222",
      addressLine1: "123 Market St",
      addressLine2: "",
      state: "NSW",
      postcode: "2000",
      logoUrl: "https://example.com/logo/freshproduce.png",
      abn: "1234567890",
      isSupplier: true,
      role: "USER", // or ADMIN if you want
      isActive: true,
    },
    {
      businessName: "Beverages Co.",
      contactName: "Jane Smith",
      email: "jane@beveragesco.com",
      businessPhone: "(02) 9876 5432",
      contactPhone: "0412 345 678",
      addressLine1: "456 Beverage Ln",
      addressLine2: "",
      state: "NSW",
      postcode: "2000",
      logoUrl: "https://example.com/logo/beverages.png",
      abn: "9876543210",
      isSupplier: true,
      role: "USER",
      isActive: true,
    },
  ]).returning({
    id: users.id,
  });

  // --- 2) Create Restaurants (Buyers) --- //
  const [gourmetSteakhouse, pizzaPalace] = await db.insert(users).values([
    {
      businessName: "Gourmet Steakhouse",
      contactName: "Alice Chef",
      email: "alice@gourmetsteak.com",
      businessPhone: "(02) 2222 3333",
      contactPhone: "0402 222 333",
      addressLine1: "100 Steak St",
      addressLine2: null,
      state: "NSW",
      postcode: "2000",
      logoUrl: "https://example.com/logo/gourmet.png",
      abn: "1111111111",
      isSupplier: false,
    },
    {
      businessName: "Pizza Palace",
      contactName: "Bob Manager",
      email: "bob@pizzapalace.com",
      businessPhone: "(02) 9999 8888",
      contactPhone: "0403 999 888",
      addressLine1: "99 Dough Rd",
      addressLine2: null,
      state: "NSW",
      postcode: "2000",
      logoUrl: "https://example.com/logo/pizza.png",
      abn: "2222222222",
      isSupplier: false,
    },
  ]).returning({
    id: users.id,
  });

  // --- 3) Create Partnerships --- //
  // e.g. Gourmet Steakhouse is partnered with Fresh Produce Co.
  //      Pizza Palace is partnered with Fresh Produce Co. and Beverages Co.

  await db.insert(partnerships).values([
    {
      restaurantId: gourmetSteakhouse.id,
      supplierId: freshProduceCo.id,
      status: 'ACTIVE',
    },
    {
      restaurantId: pizzaPalace.id,
      supplierId: freshProduceCo.id,
      status: 'ACTIVE',
    },
    {
      restaurantId: pizzaPalace.id,
      supplierId: beveragesCo.id,
      status: 'ACTIVE',
    },
  ]);

  // --- 4) Create Items for Each Supplier --- //
  // For Fresh Produce Co.
  const [lettuceItem, tomatoItem] = await db.insert(items).values([
    {
      supplierId: freshProduceCo.id,
      sku: "FP-001",
      name: "Lettuce (Iceberg)",
      price: "2.50",
      unit: "each",
      description: "Crisp iceberg lettuce",
      status: 'ACTIVE',
    },
    {
      supplierId: freshProduceCo.id,
      sku: "FP-002",
      name: "Tomatoes (kg)",
      price: "3.99",
      unit: "kg",
      description: "Fresh red tomatoes",
      status: 'ACTIVE',
    },
  ]).returning({ id: items.id });

  // For Beverages Co.
  const [colaItem, orangeJuiceItem] = await db.insert(items).values([
    {
      supplierId: beveragesCo.id,
      sku: "BV-001",
      name: "Cola (12 pack)",
      price: "12.00",
      unit: "box",
      description: "Canned cola x12",
      status: 'ACTIVE',
    },
    {
      supplierId: beveragesCo.id,
      sku: "BV-002",
      name: "Orange Juice (2L)",
      price: "4.50",
      unit: "bottle",
      description: "Freshly squeezed OJ",
      status: 'ACTIVE',
    },
  ]).returning({ id: items.id });

  // --- 5) Create Par Levels --- //
  // For Gourmet Steakhouse + Fresh Produce Co.
  const [steakhousePar] = await db.insert(parLevels).values([
    {
      name: "Weekly Produce Par",
      restaurantId: gourmetSteakhouse.id,
      supplierId: freshProduceCo.id,
    },
  ]).returning({ id: parLevels.id });

  // Insert ParLevelItems
  await db.insert(parLevelItems).values([
    {
      parLevelId: steakhousePar.id,
      itemId: lettuceItem.id,
      quantity: 10,
    },
    {
      parLevelId: steakhousePar.id,
      itemId: tomatoItem.id,
      quantity: 5,
    },
  ]);

  // For Pizza Palace + Fresh Produce Co.
  const [pizzaPalaceProducePar] = await db.insert(parLevels).values([
    {
      name: "Produce Par",
      restaurantId: pizzaPalace.id,
      supplierId: freshProduceCo.id,
    },
  ]).returning({ id: parLevels.id });

  await db.insert(parLevelItems).values([
    {
      parLevelId: pizzaPalaceProducePar.id,
      itemId: tomatoItem.id,
      quantity: 8,
    },
  ]);

  // For Pizza Palace + Beverages Co.
  const [pizzaPalaceBeveragePar] = await db.insert(parLevels).values([
    {
      name: "Beverage Par",
      restaurantId: pizzaPalace.id,
      supplierId: beveragesCo.id,
    },
  ]).returning({ id: parLevels.id });

  await db.insert(parLevelItems).values([
    {
      parLevelId: pizzaPalaceBeveragePar.id,
      itemId: colaItem.id,
      quantity: 2,
    },
    {
      parLevelId: pizzaPalaceBeveragePar.id,
      itemId: orangeJuiceItem.id,
      quantity: 3,
    },
  ]);

  // --- 6) Create Sample Orders --- //
  // 1) Gourmet Steakhouse -> Fresh Produce Co.
  const [order1] = await db.insert(orders).values([
    {
      restaurantId: gourmetSteakhouse.id,
      supplierId: freshProduceCo.id,
      type: 'ACTIVE',
      status: 'ACCEPTED',
      notes: "Please deliver between 9-10AM",
      expectedDeliveryDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
    },
  ]).returning({ id: orders.id });

  // add some items to order1
  await db.insert(orderItems).values([
    {
      orderId: order1.id,
      itemId: lettuceItem.id,
      quantity: 5,
    },
    {
      orderId: order1.id,
      itemId: tomatoItem.id,
      quantity: 2,
    },
  ]);

  // add some order history
  await db.insert(orderHistory).values([
    {
      orderId: order1.id,
      status: 'ACCEPTED',
      type: 'ACTIVE',
    },
  ]);

  // 2) Pizza Palace -> Beverages Co.
  const [order2] = await db.insert(orders).values([
    {
      restaurantId: pizzaPalace.id,
      supplierId: beveragesCo.id,
      type: 'DRAFT',
      status: 'NOT_APPLICABLE',
      notes: "We might finalize tomorrow",
      expectedDeliveryDateTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  ]).returning({ id: orders.id });

  await db.insert(orderItems).values([
    {
      orderId: order2.id,
      itemId: colaItem.id,
      quantity: 1,
    },
  ]);

  await db.insert(orderHistory).values([
    {
      orderId: order2.id,
      status: 'NOT_APPLICABLE',
      type: 'DRAFT',
    },
  ]);

  console.log("✅ Seed complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
