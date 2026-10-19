const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'haydee.db'));

// ---------- Schema ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    price_ngn INTEGER NOT NULL,
    rating REAL DEFAULT 0,
    reviews INTEGER DEFAULT 0,
    image TEXT,
    badge TEXT,
    sizes TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_address TEXT NOT NULL,
    items TEXT NOT NULL,
    subtotal_ngn INTEGER NOT NULL,
    tax_ngn INTEGER NOT NULL,
    shipping_ngn INTEGER NOT NULL,
    discount_ngn INTEGER NOT NULL DEFAULT 0,
    total_ngn INTEGER NOT NULL,
    promo_code TEXT,
    payment_method TEXT NOT NULL,
    payment_status TEXT NOT NULL,
    payment_reference TEXT,
    order_status TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// ---------- Seed products (only if empty) ----------
const count = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
if (count === 0) {
  const PRODUCTS = [
    { id: 1, title: "Classic Suede Loafers - Charcoal", category: "Loafers", priceNGN: 35000, rating: 4.8, reviews: 42, image: "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&q=80&w=600", badge: "Top Seller", sizes: ["M5","M6","M7","M8","M9","M10","M11"] },
    { id: 2, title: "Campus Chunky Retro Sneakers", category: "Sneakers", priceNGN: 42000, rating: 4.9, reviews: 88, image: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&q=80&w=600", badge: "Popular", sizes: ["M6","M7","M8","M9","M10"] },
    { id: 3, title: "Classic Comfort Unisex Crocs Clogs", category: "Crocs", priceNGN: 18000, rating: 4.7, reviews: 115, image: "https://images.unsplash.com/photo-1603808033192-082d6919d3e1?auto=format&fit=crop&q=80&w=600", badge: "Essential", sizes: ["M5 to M11"] },
    { id: 4, title: "Elegant Bow Female Pointed Flats", category: "Female Flats", priceNGN: 24000, rating: 4.6, reviews: 29, image: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&q=80&w=600", badge: "Trending", sizes: ["EU 37","EU 38","EU 39","EU 40","EU 41"] },
    { id: 5, title: "Premium Leather Monk Strap Male Shoes", category: "Male Shoes", priceNGN: 48000, rating: 5.0, reviews: 64, image: "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?auto=format&fit=crop&q=80&w=600", badge: "Luxury", sizes: ["M7","M8","M9","M10","M11"] },
    { id: 6, title: "Comfort Rubber Casual Slides", category: "Slides", priceNGN: 15000, rating: 4.5, reviews: 50, image: "https://images.unsplash.com/photo-1603487742131-4160ec999306?auto=format&fit=crop&q=80&w=600", badge: "Hot Pick", sizes: ["M5","M6","M7","M8","M9","M10"] }
  ];

  const insert = db.prepare(`
    INSERT INTO products (id, title, category, price_ngn, rating, reviews, image, badge, sizes)
    VALUES (@id, @title, @category, @priceNGN, @rating, @reviews, @image, @badge, @sizesJson)
  `);

  const insertMany = db.transaction((products) => {
    for (const p of products) {
      insert.run({ ...p, sizesJson: JSON.stringify(p.sizes) });
    }
  });

  insertMany(PRODUCTS);
  console.log(`✅ Seeded ${PRODUCTS.length} products`);
}

module.exports = db;