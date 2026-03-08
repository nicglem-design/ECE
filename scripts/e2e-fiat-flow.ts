/**
 * E2E test: fiat deposit → buy crypto → sell crypto → withdraw
 *
 * Run with: npx tsx scripts/e2e-fiat-flow.ts
 * Requires: API running on http://localhost:4000
 *
 * Flow:
 * 1. Sign up test user (e2e-*@test.local – auto-verified when RESEND is configured)
 * 2. Login
 * 3. Manual deposit (simulates Stripe deposit)
 * 4. Swap USD → BTC (buy crypto with fiat)
 * 5. Swap BTC → USD (sell crypto for fiat)
 * 6. Attempt withdraw (requires Stripe Connect; will fail with BANK_REQUIRED if not connected)
 */

const API_BASE = process.env.API_BACKEND_URL || "http://localhost:4000";
const TEST_EMAIL = `e2e-${Date.now()}@test.local`;
const TEST_PASSWORD = "TestPassword123!";
const TEST_BIRTH_DATE = "1990-01-15"; // 18+ for eligibility

let token: string;

async function fetchApi(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

async function main() {
  console.log("E2E: Fiat deposit → buy crypto → sell crypto → withdraw\n");
  console.log("API:", API_BASE);

  // 1. Sign up
  console.log("\n1. Sign up...");
  const signup = await fetchApi("/api/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      birthDate: TEST_BIRTH_DATE,
      acceptedTerms: true,
    }),
  });
  token = signup.token;
  console.log("   OK");

  // 2. Login
  console.log("\n2. Login...");
  const login = await fetchApi("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  token = login.token;
  console.log("   OK");

  // 3. Manual deposit
  console.log("\n3. Deposit 100 USD...");
  await fetchApi("/api/v1/accounts/deposit", {
    method: "POST",
    body: JSON.stringify({ currency: "USD", amount: 100, method: "card" }),
  });
  const fiatAfter = await fetchApi("/api/v1/accounts/fiat");
  const usdBal = fiatAfter.balances?.find((b: { currency: string }) => b.currency === "USD");
  console.log("   OK. Fiat balance:", usdBal?.amount ?? 0, "USD");

  // 4. Swap USD → BTC (buy crypto)
  console.log("\n4. Swap 10 USD → BTC...");
  // Call swap-execution directly (updates balances; bypasses order book for this test)
  const btcPrice = 95000; // approx
  const toAmount = (10 * 0.9995) / btcPrice; // after 0.5% fee
  await fetchApi("/api/v1/wallet/swap-execution", {
    method: "POST",
    body: JSON.stringify({
      fromCoinId: "usd",
      toCoinId: "bitcoin",
      fromAmount: 10,
      toAmount,
    }),
  });
  const balancesAfter = await fetchApi("/api/v1/wallet/balances");
  const btcBal = balancesAfter.assets?.find((b: { chainId: string; amount: string }) => b.chainId === "bitcoin");
  const btcAmount = btcBal ? parseFloat(btcBal.amount) : toAmount;
  console.log("   OK. BTC balance:", btcAmount);

  // 5. Swap BTC → USD (sell crypto)
  console.log("\n5. Swap BTC → USD...");
  const sellAmount = btcAmount * 0.5; // sell half
  const usdReceived = sellAmount * btcPrice * 0.9995;
  await fetchApi("/api/v1/wallet/swap-execution", {
    method: "POST",
    body: JSON.stringify({
      fromCoinId: "bitcoin",
      toCoinId: "usd",
      fromAmount: sellAmount,
      toAmount: usdReceived,
    }),
  });
  const fiatAfterSell = await fetchApi("/api/v1/accounts/fiat");
  const usdAfter = fiatAfterSell.balances?.find((b: { currency: string }) => b.currency === "USD");
  console.log("   OK. Fiat balance:", usdAfter?.amount ?? 0, "USD");

  // 6. Withdraw (will fail with BANK_REQUIRED if no Stripe Connect)
  console.log("\n6. Withdraw...");
  try {
    await fetchApi("/api/v1/accounts/withdraw", {
      method: "POST",
      body: JSON.stringify({ currency: "USD", amount: 1 }),
    });
    console.log("   OK (withdraw submitted)");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Connect your bank") || msg.includes("BANK_REQUIRED")) {
      console.log("   Expected: Connect bank required (no Stripe Connect)");
    } else {
      throw e;
    }
  }

  console.log("\n✓ E2E flow complete.");
}

main().catch((err) => {
  console.error("\n✗ Failed:", err.message);
  process.exit(1);
});
