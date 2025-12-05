const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Temporary database in memory
const payments = {};

const UPI_ID = "officialanmoldrawings@okhdfcbank";
const MERCHANT_NAME = "OFFICIAL ANMOL DRAWINGS";

function generatePaymentId() {
  return "PAY_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
}

// ========== 1. CREATE PAYMENT ==========
app.post("/create-payment", (req, res) => {
  const { amount, userId } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: "Invalid amount" });
  }

  const paymentId = generatePaymentId();
  const createdAt = Date.now();

  payments[paymentId] = {
    amount,
    userId: userId || null,
    status: "PENDING",
    createdAt,
    paidAt: null,
    utr: null,
    smsTime: null
  };

  const upiLink = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(
    MERCHANT_NAME
  )}&am=${amount}&cu=INR`;

  res.json({
    success: true,
    paymentId,
    upiLink,
    upiId: UPI_ID,
    merchantName: MERCHANT_NAME
  });
});

// ========== 2. RECEIVE SMS WEBHOOK ==========
app.post("/sms-webhook", (req, res) => {
  const { message, from, time } = req.body;

  console.log("SMS Received:", message);

  if (!message) {
    return res.status(400).json({ success: false });
  }

  // Find amount
  const amountMatch = message.match(/(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i);
  if (!amountMatch) {
    return res.json({ success: true, matched: false });
  }
  const amount = parseFloat(amountMatch[1].replace(/,/g, ""));

  // Find UTR/Ref
  const utrMatch = message.match(/(?:Ref|REF|UTR)[\s:]+([A-Za-z0-9]+)/);
  const utr = utrMatch ? utrMatch[1] : null;

  const smsTime = time || new Date().toISOString();
  const now = Date.now();
  const TIME_LIMIT = 15 * 60 * 1000; // 15 minutes

  let matchedPaymentId = null;

  for (const [pid, pay] of Object.entries(payments)) {
    if (pay.status === "PENDING") {
      const age = now - pay.createdAt;

      if (age < TIME_LIMIT && Math.abs(pay.amount - amount) < 0.01) {
        matchedPaymentId = pid;
        break;
      }
    }
  }

  if (!matchedPaymentId) {
    return res.json({ success: true, matched: false });
  }

  payments[matchedPaymentId].status = "PAID";
  payments[matchedPaymentId].paidAt = now;
  payments[matchedPaymentId].utr = utr;
  payments[matchedPaymentId].smsTime = smsTime;

  res.json({
    success: true,
    matched: true,
    paymentId: matchedPaymentId,
    amount,
    utr,
    smsTime
  });
});

// ========== 3. CHECK PAYMENT ==========
app.get("/check-payment", (req, res) => {
  const { paymentId } = req.query;
  const pay = payments[paymentId];

  if (!pay) {
    return res.status(404).json({ success: false, message: "Not found" });
  }

  res.json({
    success: true,
    status: pay.status,
    amount: pay.amount,
    utr: pay.utr,
    smsTime: pay.smsTime
  });
});

app.listen(PORT, () => console.log("Server running on port", PORT));
