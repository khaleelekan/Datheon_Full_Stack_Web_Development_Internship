require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { authRequired, authOptional, JWT_SECRET } = require('./middleware');
const { verifyPaystack, verifyFlutterwave } = require('./verify-payments');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Server is the authority for promo codes
const PROMO_CODES = { HAYDEE10: 0.10, WELCOME5: 0.05 };

// ---------- Health ----------
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------- Public config (safe keys only) ----------
app.get('/api/config', (req, res) => {
  res.json({
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    flwPublicKey: process.env.FLW_PUBLIC_KEY || ''
  });
});

// ---------- Products ----------
app.get('/api/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY id').all();
  res.json({
    products: rows.map(r => ({
      id: r.id,
      title: r.title,
      category: r.category,
      priceNGN: r.price_ngn,
      rating: r.rating,
      reviews: r.reviews,
      image: r.image,
      badge: r.badge,
      sizes: JSON.parse(r.sizes)
    }))
  });
});

// ---------- Auth: Register ----------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (exists) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const info = db.prepare(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'
    ).run(String(name).trim(), normalizedEmail, passwordHash);

    const user = { id: info.lastInsertRowid, name: String(name).trim(), email: normalizedEmail };
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ---------- Auth: Login ----------
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
    if (!row) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const user = { id: row.id, name: row.name, email: row.email };
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ---------- Auth: Current user ----------
app.get('/api/auth/me', authRequired, (req, res) => {
  const row = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json({ user: row });
});

// ---------- Promo code validation ----------
app.post('/api/promo/validate', (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const rate = PROMO_CODES[code];
  if (rate === undefined) return res.status(400).json({ error: 'Invalid promo code' });
  res.json({ code, rate });
});

// ---------- Create order (with payment verification) ----------
app.post('/api/orders', authOptional, async (req, res) => {
  try {
    const { customer, items, promoCode, paymentMethod, paymentReference } = req.body || {};

    if (!customer || !customer.name || !customer.email || !customer.phone || !customer.address) {
      return res.status(400).json({ error: 'Missing customer details' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    if (!paymentMethod) {
      return res.status(400).json({ error: 'Payment method is required' });
    }

    // Recalculate totals server-side — never trust client prices
    const productRows = db.prepare('SELECT * FROM products').all();
    const productMap = Object.fromEntries(productRows.map(p => [p.id, p]));

    let subtotal = 0;
    const normalizedItems = items.map(item => {
      const product = productMap[Number(item.id)];
      if (!product) throw new Error(`Unknown product id: ${item.id}`);
      const qty = Math.max(1, parseInt(item.qty, 10) || 1);
      const size = String(item.size || 'Default');
      subtotal += product.price_ngn * qty;
      return { id: product.id, title: product.title, size, qty, priceNGN: product.price_ngn };
    });

    const promoRate = promoCode ? (PROMO_CODES[String(promoCode).toUpperCase()] || 0) : 0;
    const discount = Math.round(subtotal * promoRate);
    const tax = Math.round(subtotal * 0.05);
    const shipping = subtotal > 0 ? 2500 : 0;
    const total = subtotal - discount + tax + shipping;

    // Verify payment if a reference was supplied
    let paymentStatus = 'Pending Payment';
    let reference = paymentReference || `HD-${Date.now()}`;
    let verified = false;

    if (paymentMethod === 'paystack') {
      if (!paymentReference) return res.status(400).json({ error: 'Missing payment reference' });
      const result = await verifyPaystack(paymentReference);
      if (result.currency !== 'NGN') {
        return res.status(400).json({ error: `Unexpected currency: ${result.currency}` });
      }
      if (result.amountNGN !== total) {
        return res.status(400).json({
          error: `Amount mismatch: paid ₦${result.amountNGN}, expected ₦${total}. Refresh cart and try again.`
        });
      }
      paymentStatus = 'Paid';
      reference = result.reference;
      verified = true;
    } else if (paymentMethod === 'flutterwave') {
      if (!paymentReference) return res.status(400).json({ error: 'Missing payment reference' });
      const result = await verifyFlutterwave(paymentReference);
      if (result.currency !== 'NGN') {
        return res.status(400).json({ error: `Unexpected currency: ${result.currency}` });
      }
      if (result.amountNGN !== total) {
        return res.status(400).json({
          error: `Amount mismatch: paid ₦${result.amountNGN}, expected ₦${total}. Refresh cart and try again.`
        });
      }
      paymentStatus = 'Paid';
      reference = result.reference;
      verified = true;
    } else if (['bank', 'whatsapp', 'cod'].includes(paymentMethod)) {
      paymentStatus = 'Pending Payment';
    } else {
      return res.status(400).json({ error: `Unknown payment method: ${paymentMethod}` });
    }

    const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const orderStatus = verified ? 'Processing' : 'Pending Payment';

    db.prepare(`
      INSERT INTO orders (
        id, user_id, customer_name, customer_email, customer_phone, customer_address,
        items, subtotal_ngn, tax_ngn, shipping_ngn, discount_ngn, total_ngn,
        promo_code, payment_method, payment_status, payment_reference, order_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      req.user ? req.user.id : null,
      customer.name,
      customer.email,
      customer.phone,
      customer.address,
      JSON.stringify(normalizedItems),
      subtotal,
      tax,
      shipping,
      discount,
      total,
      promoCode ? String(promoCode).toUpperCase() : null,
      paymentMethod,
      paymentStatus,
      reference,
      orderStatus
    );

    res.json({
      order: {
        id: orderId,
        items: normalizedItems,
        subtotal, tax, shipping, discount, total,
        paymentMethod,
        paymentStatus,
        paymentReference: reference,
        orderStatus,
        customer,
        createdAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Order error:', err);
    res.status(500).json({ error: err.message || 'Failed to create order' });
  }
});

// ---------- List current user's orders ----------
app.get('/api/orders', authRequired, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);

  res.json({
    orders: rows.map(r => ({
      id: r.id,
      items: JSON.parse(r.items),
      subtotal: r.subtotal_ngn,
      tax: r.tax_ngn,
      shipping: r.shipping_ngn,
      discount: r.discount_ngn,
      total: r.total_ngn,
      promoCode: r.promo_code,
      paymentMethod: r.payment_method,
      paymentStatus: r.payment_status,
      paymentReference: r.payment_reference,
      orderStatus: r.order_status,
      customer: {
        name: r.customer_name,
        email: r.customer_email,
        phone: r.customer_phone,
        address: r.customer_address
      },
      createdAt: r.created_at
    }))
  });
});

// ---------- Fallbacks ----------
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  next();
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🛍️  HaydeeFooties server running on http://localhost:${PORT}\n`);
  if (!process.env.JWT_SECRET) console.warn('⚠️  JWT_SECRET is not set — using insecure default');
  if (!process.env.PAYSTACK_SECRET_KEY) console.warn('⚠️  PAYSTACK_SECRET_KEY is not set');
  if (!process.env.FLW_SECRET_KEY) console.warn('⚠️  FLW_SECRET_KEY is not set');
});