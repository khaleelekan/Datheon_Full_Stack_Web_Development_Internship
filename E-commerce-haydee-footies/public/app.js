// ============================================================
// CONFIG & STATE
// ============================================================
const API = ''; // same origin
const EXCHANGE_RATE = 1500;

let PAYSTACK_PUBLIC_KEY = '';
let FLW_PUBLIC_KEY = '';

const FALLBACK_PRODUCTS = [
  { id: 1, title: "Classic Suede Loafers - Charcoal", category: "Loafers", priceNGN: 35000, rating: 4.8, reviews: 42, image: "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&q=80&w=600", badge: "Top Seller", sizes: ["M5","M6","M7","M8","M9","M10","M11"] },
  { id: 2, title: "Campus Chunky Retro Sneakers", category: "Sneakers", priceNGN: 42000, rating: 4.9, reviews: 88, image: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&q=80&w=600", badge: "Popular", sizes: ["M6","M7","M8","M9","M10"] },
  { id: 3, title: "Classic Comfort Unisex Crocs Clogs", category: "Crocs", priceNGN: 18000, rating: 4.7, reviews: 115, image: "https://images.unsplash.com/photo-1603808033192-082d6919d3e1?auto=format&fit=crop&q=80&w=600", badge: "Essential", sizes: ["M5 to M11"] },
  { id: 4, title: "Elegant Bow Female Pointed Flats", category: "Female Flats", priceNGN: 24000, rating: 4.6, reviews: 29, image: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&q=80&w=600", badge: "Trending", sizes: ["EU 37","EU 38","EU 39","EU 40","EU 41"] },
  { id: 5, title: "Premium Leather Monk Strap Male Shoes", category: "Male Shoes", priceNGN: 48000, rating: 5.0, reviews: 64, image: "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?auto=format&fit=crop&q=80&w=600", badge: "Luxury", sizes: ["M7","M8","M9","M10","M11"] },
  { id: 6, title: "Comfort Rubber Casual Slides", category: "Slides", priceNGN: 15000, rating: 4.5, reviews: 50, image: "https://images.unsplash.com/photo-1603487742131-4160ec999306?auto=format&fit=crop&q=80&w=600", badge: "Hot Pick", sizes: ["M5","M6","M7","M8","M9","M10"] }
];

let PRODUCTS = FALLBACK_PRODUCTS;
let currentCurrency = 'NGN';
let selectedCategory = 'all';
let cart = JSON.parse(localStorage.getItem('haydee_cart')) || [];
let wishlist = JSON.parse(localStorage.getItem('haydee_wishlist')) || [];
let appliedPromo = null;

let authToken = localStorage.getItem('haydee_token') || null;
let currentUser = null;

// ============================================================
// DOM ELEMENTS
// ============================================================
const $ = id => document.getElementById(id);
const productGrid = $('productGrid');
const searchInput = $('searchInput');
const sortBy = $('sortBy');
const currencySelect = $('currencySelect');
const cartDrawer = $('cartDrawer');
const cartOverlay = $('cartOverlay');
const cartCount = $('cartCount');
const drawerCartCount = $('drawerCartCount');
const cartItemsContainer = $('cartItems');
const subtotalAmount = $('subtotalAmount');
const taxAmount = $('taxAmount');
const totalAmount = $('totalAmount');
const quickViewModal = $('quickViewModal');
const modalBody = $('modalBody');
const checkoutModal = $('checkoutModal');
const wishlistDrawer = $('wishlistDrawer');
const wishlistOverlay = $('wishlistOverlay');
const wishlistCount = $('wishlistCount');
const drawerWishlistCount = $('drawerWishlistCount');
const wishlistItemsContainer = $('wishlistItems');
const accountBtn = $('accountBtn');
const accountDropdown = $('accountDropdown');
const accountLabel = $('accountLabel');
const loginLink = $('loginLink');
const profileLink = $('profileLink');
const ordersLink = $('ordersLink');
const logoutLink = $('logoutLink');
const wishlistLink = $('wishlistLink');
const loginModal = $('loginModal');
const profileModal = $('profileModal');
const ordersModal = $('ordersModal');
const receiptModal = $('receiptModal');

// ============================================================
// API HELPER
// ============================================================
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(API + path, { ...options, headers });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  renderProducts();
  updateCartUI();
  updateWishlistUI();
  updateAuthUI();
  setupEventListeners();

  try {
    const cfg = await api('/api/config');
    PAYSTACK_PUBLIC_KEY = cfg.paystackPublicKey || '';
    FLW_PUBLIC_KEY = cfg.flwPublicKey || '';
  } catch (err) {
    console.warn('Could not fetch config; payment popups will not open.', err);
  }

  try {
    const data = await api('/api/products');
    if (data.products && data.products.length) {
      PRODUCTS = data.products;
      renderProducts();
    }
  } catch (err) {
    console.warn('Could not fetch products; using fallback.', err);
  }

  if (authToken) {
    try {
      const data = await api('/api/auth/me');
      currentUser = data.user;
    } catch {
      authToken = null;
      localStorage.removeItem('haydee_token');
    }
    updateAuthUI();
  }
});

// ============================================================
// PRICE FORMATTER
// ============================================================
function formatPrice(amountNGN) {
  if (currentCurrency === 'USD') return '$' + (amountNGN / EXCHANGE_RATE).toFixed(2);
  return '₦' + Number(amountNGN).toLocaleString();
}

// ============================================================
// PRODUCT RENDERING
// ============================================================
function renderProducts() {
  const q = searchInput.value.toLowerCase();
  let filtered = PRODUCTS.filter(p => {
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesSearch = p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  const sortVal = sortBy.value;
  if (sortVal === 'price-low') filtered.sort((a, b) => a.priceNGN - b.priceNGN);
  if (sortVal === 'price-high') filtered.sort((a, b) => b.priceNGN - a.priceNGN);
  if (sortVal === 'rating') filtered.sort((a, b) => b.rating - a.rating);

  productGrid.innerHTML = filtered.map(p => `
    <div class="product-card">
      <div class="product-img-wrapper">
        <span class="product-badge">${p.badge}</span>
        <img src="${p.image}" alt="${p.title}">
        <button class="wishlist-btn ${wishlist.includes(p.id) ? 'active' : ''}"
                onclick="toggleWishlist(${p.id}, event)" title="Add to Wishlist">
          <i class="fas fa-heart"></i>
        </button>
        <button class="quick-view-btn" onclick="openQuickView(${p.id})">
          <i class="fas fa-eye"></i>
        </button>
      </div>
      <div class="product-details">
        <span class="product-category">${p.category}</span>
        <h3 class="product-title">${p.title}</h3>
        <div class="product-rating"><i class="fas fa-star"></i> ${p.rating} <span>(${p.reviews})</span></div>
        <div class="product-bottom">
          <span class="product-price">${formatPrice(p.priceNGN)}</span>
          <button class="add-to-cart-btn" onclick="addToCart(${p.id})">Add to Cart</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  searchInput.addEventListener('input', renderProducts);
  sortBy.addEventListener('change', renderProducts);

  currencySelect.addEventListener('change', (e) => {
    currentCurrency = e.target.value;
    renderProducts();
    updateCartUI();
    updateWishlistUI();
  });

  $('categoryFilters').addEventListener('click', (e) => {
    if (e.target.classList.contains('category-btn')) {
      document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      selectedCategory = e.target.dataset.category;
      renderProducts();
    }
  });

  $('openCartBtn').addEventListener('click', openCart);
  $('closeCartBtn').addEventListener('click', closeCart);
  cartOverlay.addEventListener('click', closeCart);
  $('continueShoppingBtn').addEventListener('click', closeCart);
  $('clearCartBtn').addEventListener('click', clearCart);

  $('closeWishlistBtn').addEventListener('click', closeWishlist);
  wishlistOverlay.addEventListener('click', closeWishlist);
  wishlistLink.addEventListener('click', (e) => { e.preventDefault(); openWishlist(); });

  $('closeModalBtn').addEventListener('click', () => quickViewModal.classList.remove('active'));
  $('closeCheckoutBtn').addEventListener('click', () => checkoutModal.classList.remove('active'));

  $('checkoutBtn').addEventListener('click', () => {
    if (cart.length === 0) return showToast('Your cart is empty!');
    closeCart();
    $('modalGrandTotal').innerText = calculateTotalFormatted();
    if (currentUser) {
      $('custName').value = currentUser.name;
      $('custEmail').value = currentUser.email;
    }
    checkoutModal.classList.add('active');
  });

  $('checkoutForm').addEventListener('submit', handleCheckout);

  $('applyPromoBtn').addEventListener('click', applyPromoCode);
  $('removePromoBtn').addEventListener('click', removePromo);

  document.querySelectorAll('input[name="payment"]').forEach(radio => {
    radio.addEventListener('change', updateConfirmButtonLabel);
  });

  accountBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    accountDropdown.classList.toggle('active');
  });
  document.addEventListener('click', (e) => {
    if (!accountBtn.contains(e.target) && !accountDropdown.contains(e.target)) {
      accountDropdown.classList.remove('active');
    }
  });

  loginLink.addEventListener('click', (e) => { e.preventDefault(); accountDropdown.classList.remove('active'); openLoginModal(); });
  profileLink.addEventListener('click', (e) => { e.preventDefault(); accountDropdown.classList.remove('active'); openProfileModal(); });
  ordersLink.addEventListener('click', (e) => { e.preventDefault(); accountDropdown.classList.remove('active'); openOrdersModal(); });
  logoutLink.addEventListener('click', (e) => { e.preventDefault(); accountDropdown.classList.remove('active'); logout(); });

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      $(tab.dataset.tab + 'Form').classList.add('active');
    });
  });

  $('loginForm').addEventListener('submit', handleLogin);
  $('registerForm').addEventListener('submit', handleRegister);

  $('closeLoginBtn').addEventListener('click', () => loginModal.classList.remove('active'));
  $('closeProfileBtn').addEventListener('click', () => profileModal.classList.remove('active'));
  $('closeOrdersBtn').addEventListener('click', () => ordersModal.classList.remove('active'));
  $('closeReceiptBtn').addEventListener('click', () => receiptModal.classList.remove('active'));

  $('viewOrdersBtn').addEventListener('click', () => {
    profileModal.classList.remove('active');
    openOrdersModal();
  });

  const backToTopBtn = $('backToTopBtn');
  window.addEventListener('scroll', () => {
    backToTopBtn.classList.toggle('visible', window.scrollY > 300);
  });
  backToTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  [loginModal, profileModal, ordersModal, quickViewModal, checkoutModal, receiptModal].forEach(m => {
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('active'); });
  });
}

// ============================================================
// CART
// ============================================================
function addToCart(productId, size = 'Default') {
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;
  const idx = cart.findIndex(i => i.id === productId && i.size === size);
  if (idx > -1) cart[idx].qty += 1;
  else cart.push({ ...product, qty: 1, size });
  saveCart();
  updateCartUI();
  showToast(`Added ${product.title} to cart!`);
}

function updateQty(id, size, change) {
  const item = cart.find(i => i.id === id && i.size === size);
  if (!item) return;
  item.qty += change;
  if (item.qty <= 0) cart = cart.filter(i => !(i.id === id && i.size === size));
  saveCart();
  updateCartUI();
}

function removeItem(id, size) {
  cart = cart.filter(i => !(i.id === id && i.size === size));
  saveCart();
  updateCartUI();
}

function clearCart() {
  if (cart.length === 0) return;
  if (confirm('Are you sure you want to clear your cart?')) {
    cart = [];
    appliedPromo = null;
    saveCart();
    updateCartUI();
    showToast('Cart cleared.');
  }
}

function saveCart() {
  localStorage.setItem('haydee_cart', JSON.stringify(cart));
}

function updateCartUI() {
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  cartCount.innerText = totalItems;
  drawerCartCount.innerText = totalItems;

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `<p style="text-align:center; color:#888; padding: 40px 0;">Your cart is empty.</p>`;
    appliedPromo = null;
  } else {
    cartItemsContainer.innerHTML = cart.map(item => `
      <div class="cart-item">
        <img src="${item.image}" alt="${item.title}" class="cart-item-img">
        <div class="cart-item-info">
          <div class="cart-item-title">${item.title}</div>
          <div class="cart-item-size">Size: ${item.size}</div>
          <div class="cart-item-price">${formatPrice(item.priceNGN * item.qty)}</div>
          <div class="cart-qty-controls">
            <button class="qty-btn" onclick="updateQty(${item.id}, '${item.size}', -1)">-</button>
            <span>${item.qty}</span>
            <button class="qty-btn" onclick="updateQty(${item.id}, '${item.size}', 1)">+</button>
          </div>
        </div>
        <button class="remove-item-btn" onclick="removeItem(${item.id}, '${item.size}')">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `).join('');
  }

  const subtotal = cart.reduce((s, i) => s + i.priceNGN * i.qty, 0);
  const tax = subtotal * 0.05;
  const shipping = subtotal > 0 ? 2500 : 0;
  const discount = appliedPromo ? Math.round(subtotal * appliedPromo.rate) : 0;
  const total = subtotal - discount + tax + shipping;

  const discountRow = $('discountRow');
  const discountAmount = $('discountAmount');
  const promoInput = $('promoCodeInput');

  if (appliedPromo && subtotal > 0) {
    discountRow.style.display = 'flex';
    discountAmount.innerText = '-' + formatPrice(discount);
    if (promoInput) promoInput.value = appliedPromo.code;
  } else {
    discountRow.style.display = 'none';
    if (promoInput) promoInput.value = '';
  }

  subtotalAmount.innerText = formatPrice(subtotal);
  taxAmount.innerText = formatPrice(tax);
  $('shippingAmount').innerText = formatPrice(shipping);
  totalAmount.innerText = formatPrice(total);
}

function getOrderTotalNGN() {
  const subtotal = cart.reduce((s, i) => s + i.priceNGN * i.qty, 0);
  const tax = subtotal * 0.05;
  const shipping = 2500;
  const discount = appliedPromo ? Math.round(subtotal * appliedPromo.rate) : 0;
  return Math.round(subtotal - discount + tax + shipping);
}

function calculateTotalFormatted() { return formatPrice(getOrderTotalNGN()); }

function openCart() { cartDrawer.classList.add('open'); cartOverlay.classList.add('active'); }
function closeCart() { cartDrawer.classList.remove('open'); cartOverlay.classList.remove('active'); }

// ============================================================
// WISHLIST
// ============================================================
function toggleWishlist(productId, event) {
  if (event) event.stopPropagation();
  const idx = wishlist.indexOf(productId);
  if (idx > -1) { wishlist.splice(idx, 1); showToast('Removed from wishlist'); }
  else { wishlist.push(productId); showToast('Added to wishlist'); }
  localStorage.setItem('haydee_wishlist', JSON.stringify(wishlist));
  updateWishlistUI();
  renderProducts();
}

function updateWishlistUI() {
  wishlistCount.innerText = wishlist.length;
  drawerWishlistCount.innerText = wishlist.length;

  if (wishlist.length === 0) {
    wishlistItemsContainer.innerHTML = `<p style="text-align:center; color:#888; padding: 40px 0;">Your wishlist is empty.</p>`;
    return;
  }
  wishlistItemsContainer.innerHTML = wishlist.map(id => {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return '';
    return `
      <div class="cart-item">
        <img src="${p.image}" alt="${p.title}" class="cart-item-img">
        <div class="cart-item-info">
          <div class="cart-item-title">${p.title}</div>
          <div class="cart-item-price">${formatPrice(p.priceNGN)}</div>
          <button class="add-to-cart-btn" style="margin-top:8px;"
                  onclick="addToCart(${p.id}); toggleWishlist(${p.id}, event);">
            Add to Cart
          </button>
        </div>
        <button class="remove-item-btn" onclick="toggleWishlist(${p.id}, event)">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
  }).join('');
}

function openWishlist() { wishlistDrawer.classList.add('open'); wishlistOverlay.classList.add('active'); }
function closeWishlist() { wishlistDrawer.classList.remove('open'); wishlistOverlay.classList.remove('active'); }

// ============================================================
// PROMO CODE
// ============================================================
async function applyPromoCode() {
  const input = $('promoCodeInput');
  const code = input.value.trim().toUpperCase();
  if (!code) return showToast('Please enter a promo code');
  try {
    const data = await api('/api/promo/validate', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
    appliedPromo = { code: data.code, rate: data.rate };
    showToast(`Promo applied: ${Math.round(data.rate * 100)}% off`);
    updateCartUI();
  } catch (err) {
    appliedPromo = null;
    updateCartUI();
    showToast(err.message || 'Invalid promo code');
  }
}

function removePromo() {
  appliedPromo = null;
  $('promoCodeInput').value = '';
  updateCartUI();
  showToast('Promo code removed');
}

// ============================================================
// QUICK VIEW
// ============================================================
function openQuickView(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  const isWish = wishlist.includes(p.id);
  modalBody.innerHTML = `
    <div><img src="${p.image}" alt="${p.title}" class="modal-img"></div>
    <div>
      <span class="product-category">${p.category}</span>
      <h2 style="color:var(--secondary); margin: 5px 0;">${p.title}</h2>
      <div class="product-rating" style="margin-bottom:15px;">
        <i class="fas fa-star"></i> ${p.rating} <span>(${p.reviews} reviews)</span>
      </div>
      <h3 style="color:var(--secondary); margin-bottom:15px;">${formatPrice(p.priceNGN)}</h3>
      <label style="font-weight:700; font-size:0.85rem;">Select Size:</label>
      <div class="size-selector">
        ${p.sizes.map((s, i) => `
          <div class="size-chip ${i === 0 ? 'active' : ''}" onclick="selectSizeChip(this, '${s}')">${s}</div>
        `).join('')}
      </div>
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button class="btn btn-primary" style="flex:1;" onclick="addToCart(${p.id}, currentModalSize)">Add To Cart</button>
        <button class="btn btn-outline" style="width:50px;" onclick="toggleWishlist(${p.id}, event)">
          <i class="fas fa-heart" style="color:${isWish ? '#e74c3c' : '#ccc'};"></i>
        </button>
      </div>
    </div>
  `;
  window.currentModalSize = p.sizes[0];
  quickViewModal.classList.add('active');
}

function selectSizeChip(el, size) {
  document.querySelectorAll('.size-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  window.currentModalSize = size;
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<i class="fas fa-check-circle"></i> ${msg}`;
  $('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ============================================================
// AUTH
// ============================================================
function updateAuthUI() {
  if (currentUser) {
    accountLabel.innerText = currentUser.name.split(' ')[0];
    loginLink.style.display = 'none';
    profileLink.style.display = 'flex';
    ordersLink.style.display = 'flex';
    logoutLink.style.display = 'flex';
  } else {
    accountLabel.innerText = 'Login';
    loginLink.style.display = 'flex';
    profileLink.style.display = 'none';
    ordersLink.style.display = 'none';
    logoutLink.style.display = 'none';
  }
}

function openLoginModal() {
  $('loginForm').reset();
  $('registerForm').reset();
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.auth-tab[data-tab="login"]').classList.add('active');
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  $('loginForm').classList.add('active');
  loginModal.classList.add('active');
}

async function handleLogin(e) {
  e.preventDefault();
  const email = $('loginEmail').value.trim().toLowerCase();
  const password = $('loginPassword').value;
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    authToken = data.token;
    localStorage.setItem('haydee_token', authToken);
    currentUser = data.user;
    updateAuthUI();
    loginModal.classList.remove('active');
    showToast(`Welcome back, ${data.user.name}!`);
  } catch (err) {
    showToast(err.message || 'Login failed');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = $('regName').value.trim();
  const email = $('regEmail').value.trim().toLowerCase();
  const password = $('regPassword').value;
  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    authToken = data.token;
    localStorage.setItem('haydee_token', authToken);
    currentUser = data.user;
    updateAuthUI();
    loginModal.classList.remove('active');
    showToast(`Account created! Welcome, ${data.user.name}!`);
  } catch (err) {
    showToast(err.message || 'Registration failed');
  }
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('haydee_token');
  updateAuthUI();
  showToast('Logged out successfully');
}

function openProfileModal() {
  if (!currentUser) return;
  $('profileName').innerText = currentUser.name;
  $('profileEmail').innerText = currentUser.email;
  profileModal.classList.add('active');
}

async function openOrdersModal() {
  if (!currentUser) return showToast('Please login to view orders');
  const list = $('ordersList');
  list.innerHTML = '<p style="text-align:center; color:#888; padding:20px 0;">Loading…</p>';
  ordersModal.classList.add('active');
  try {
    const data = await api('/api/orders');
    if (!data.orders.length) {
      list.innerHTML = '<p style="text-align:center; color:#888; padding:20px 0;">No orders yet.</p>';
      return;
    }
    list.innerHTML = data.orders.map(o => `
      <div class="order-card">
        <h4>Order #${o.id}</h4>
        <div class="order-meta">${new Date(o.createdAt).toLocaleString()} • ${o.orderStatus}</div>
        <div class="order-items">
          ${o.items.map(i => `${i.title} (${i.size}) x${i.qty}`).join('<br>')}
        </div>
        <div class="order-payment">
          <span>${o.paymentMethod}</span>
          <span style="color:${o.paymentStatus === 'Paid' ? '#27ae60' : '#e67e22'};">
            ${o.paymentStatus}
          </span>
        </div>
        <div class="order-total">Total: ${formatPrice(o.total)}</div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<p style="text-align:center; color:#e74c3c; padding:20px 0;">${err.message}</p>`;
  }
}

// ============================================================
// CHECKOUT + PAYMENTS
// ============================================================
function updateConfirmButtonLabel() {
  const val = document.querySelector('input[name="payment"]:checked').value;
  const btn = $('confirmOrderBtn');
  const bankDetails = $('bankTransferDetails');

  bankDetails.style.display = val === 'bank' ? 'block' : 'none';

  if (val === 'paystack' || val === 'flutterwave') {
    btn.innerHTML = '<span id="confirmOrderLabel">Pay Now</span> <i class="fas fa-lock"></i>';
  } else if (val === 'whatsapp') {
    btn.innerHTML = '<span id="confirmOrderLabel">Send via WhatsApp</span> <i class="fab fa-whatsapp"></i>';
  } else if (val === 'cod') {
    btn.innerHTML = '<span id="confirmOrderLabel">Place Order</span> <i class="fas fa-check"></i>';
  } else {
    btn.innerHTML = '<span id="confirmOrderLabel">Confirm Order</span> <i class="fas fa-check"></i>';
  }
}

async function handleCheckout(e) {
  e.preventDefault();
  if (cart.length === 0) return showToast('Your cart is empty!');

  const details = {
    name: $('custName').value.trim(),
    email: $('custEmail').value.trim(),
    phone: $('custPhone').value.trim(),
    address: $('custAddress').value.trim(),
    method: document.querySelector('input[name="payment"]:checked').value
  };

  if (details.method === 'paystack') return payWithPaystack(details);
  if (details.method === 'flutterwave') return payWithFlutterwave(details);

  await submitOrder(details, details.method, null);
}

function payWithPaystack(details) {
  if (typeof PaystackPop === 'undefined') return showToast('Paystack SDK not loaded.');
  if (!PAYSTACK_PUBLIC_KEY) return showToast('Paystack is not configured on the server.');

  const reference = `HD-PS-${Date.now()}`;
  const total = getOrderTotalNGN();

  try {
    const handler = PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: details.email,
      amount: total * 100,
      currency: 'NGN',
      ref: reference,
      metadata: {
        custom_fields: [
          { display_name: 'Customer Name', variable_name: 'name', value: details.name },
          { display_name: 'Phone', variable_name: 'phone', value: details.phone }
        ]
      },
      callback: async (response) => {
        await submitOrder(details, 'paystack', response.reference);
      },
      onClose: () => showToast('Payment cancelled.')
    });
    handler.openIframe();
  } catch (err) {
    showToast('Could not open Paystack: ' + err.message);
  }
}

function payWithFlutterwave(details) {
  if (typeof FlutterwaveCheckout !== 'function') return showToast('Flutterwave SDK not loaded.');
  if (!FLW_PUBLIC_KEY) return showToast('Flutterwave is not configured on the server.');

  const txRef = `HD-FLW-${Date.now()}`;
  const total = getOrderTotalNGN();

  try {
    FlutterwaveCheckout({
      public_key: FLW_PUBLIC_KEY,
      tx_ref: txRef,
      amount: total,
      currency: 'NGN',
      payment_options: 'card, banktransfer, ussd',
      customer: {
        email: details.email,
        name: details.name,
        phone_number: details.phone
      },
      customizations: {
        title: 'HaydeeFooties',
        description: 'Footwear purchase'
      },
      callback: async (data) => {
        if (data.status === 'successful' || data.status === 'completed') {
          await submitOrder(details, 'flutterwave', String(data.transaction_id));
        } else {
          showToast('Payment not completed.');
        }
      },
      onclose: () => showToast('Payment cancelled.')
    });
  } catch (err) {
    showToast('Could not open Flutterwave: ' + err.message);
  }
}

async function submitOrder(details, method, paymentReference) {
  const btn = $('confirmOrderBtn');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying payment…';

  try {
    const payload = {
      customer: {
        name: details.name,
        email: details.email,
        phone: details.phone,
        address: details.address
      },
      items: cart.map(i => ({ id: i.id, size: i.size, qty: i.qty })),
      promoCode: appliedPromo ? appliedPromo.code : null,
      paymentMethod: method,
      paymentReference
    };

    const result = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showReceipt(result.order);
    cart = [];
    appliedPromo = null;
    saveCart();
    updateCartUI();
    checkoutModal.classList.remove('active');
  } catch (err) {
    showToast(err.message || 'Order failed. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

function showReceipt(order) {
  const detailsEl = $('receiptDetails');
  const itemRows = order.items.map(i => `
    <div class="receipt-row">
      <span>${i.title} (${i.size}) × ${i.qty}</span>
      <strong>${formatPrice(i.priceNGN * i.qty)}</strong>
    </div>
  `).join('');

  const paid = order.paymentStatus === 'Paid';
  detailsEl.innerHTML = `
    ${itemRows}
    <div class="receipt-row" style="margin-top:8px;">
      <span>Payment Method</span><strong>${order.paymentMethod}</strong>
    </div>
    <div class="receipt-row">
      <span>Payment Status</span>
      <strong style="color:${paid ? '#27ae60' : '#e67e22'};">${order.paymentStatus}</strong>
    </div>
    <div class="receipt-row">
      <span>Reference</span>
      <strong style="font-size:0.72rem;">${order.paymentReference || order.id}</strong>
    </div>
    <div class="receipt-row">
      <span>Total</span><strong>${formatPrice(order.total)}</strong>
    </div>
    ${!paid && order.paymentMethod === 'bank'
      ? `<p style="margin-top:12px; font-size:0.82rem; color:var(--text-muted);">
           Transfer to GTBank 0123456789 (Haydee Footies) and send proof to WhatsApp +234 915 255 9516.
         </p>` : ''}
  `;
  receiptModal.classList.add('active');
}