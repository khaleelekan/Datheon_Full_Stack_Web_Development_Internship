// Verifies a Paystack transaction. Returns { amountNGN, currency, reference } or throws.
async function verifyPaystack(reference) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY not configured');

  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secret}` } }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.status) {
    throw new Error(data.message || `Paystack verify failed (${res.status})`);
  }
  const tx = data.data;
  if (tx.status !== 'success') {
    throw new Error(`Payment status is "${tx.status}", not success`);
  }
  return {
    amountNGN: Math.round(tx.amount / 100), // Paystack returns kobo
    currency: tx.currency,
    reference: tx.reference
  };
}

// Verifies a Flutterwave transaction by its numeric transaction ID.
async function verifyFlutterwave(transactionId) {
  const secret = process.env.FLW_SECRET_KEY;
  if (!secret) throw new Error('FLW_SECRET_KEY not configured');

  const res = await fetch(
    `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`,
    { headers: { Authorization: `Bearer ${secret}` } }
  );

  const data = await res.json().catch(() => ({}));
  if (data.status !== 'success' || !data.data) {
    throw new Error(data.message || 'Flutterwave verify failed');
  }
  const tx = data.data;
  if (tx.status !== 'successful') {
    throw new Error(`Payment status is "${tx.status}", not successful`);
  }
  return {
    amountNGN: Math.round(tx.amount),
    currency: tx.currency,
    reference: tx.tx_ref
  };
}

module.exports = { verifyPaystack, verifyFlutterwave };