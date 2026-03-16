const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const { ApixMiddleware } = require("./index.js");

const TEST_SECRET = "unit-test-secret";
const DEFAULT_RPC_URL = "http://127.0.0.1:8545";
const DEFAULT_PAYMENT = Object.freeze({
  requestId: "req_test_payment",
  chainId: 402,
  network: "eip155:402",
  currency: "APIX",
  amount: "10",
  amountWei: "10000000000000000000",
  recipient: "0x000000000000000000000000000000000000dEaD",
  minConfirmations: 1,
});
const BASE_CONFIG = Object.freeze({
  jwtSecret: TEST_SECRET,
  rpcUrl: DEFAULT_RPC_URL,
  paymentChainId: DEFAULT_PAYMENT.chainId,
  paymentNetwork: DEFAULT_PAYMENT.network,
  paymentCurrency: DEFAULT_PAYMENT.currency,
  paymentAmount: DEFAULT_PAYMENT.amount,
  paymentAmountWei: DEFAULT_PAYMENT.amountWei,
  paymentRecipient: DEFAULT_PAYMENT.recipient,
  paymentMinConfirmations: DEFAULT_PAYMENT.minConfirmations,
});

function toHex(value) {
  return `0x${BigInt(value).toString(16)}`;
}

function createTestStore() {
  const map = new Map();
  return {
    map,
    get(token) {
      return map.get(token);
    },
    set(token, value) {
      map.set(token, value);
    },
    delete(token) {
      map.delete(token);
    },
  };
}

function createMiddlewareWithSession(quota = 2, overrides = {}) {
  const sessionStore = createTestStore();
  const middleware = new ApixMiddleware({
    ...BASE_CONFIG,
    sessionStore,
    ...overrides,
  });
  const token = jwt.sign({ max_requests: quota }, TEST_SECRET, { expiresIn: "1h" });

  sessionStore.set(token, {
    claims: jwt.decode(token),
    remainingQuota: quota,
    requestState: "idle",
  });

  return { middleware, token, sessionStore };
}

function createDefaultPayment(overrides = {}) {
  return {
    ...DEFAULT_PAYMENT,
    ...overrides,
  };
}

function createMockRpcFixture(overrides = {}) {
  const txHash = overrides.txHash || `0x${"1".repeat(64)}`;
  const payment = createDefaultPayment({
    requestId: overrides.requestId || DEFAULT_PAYMENT.requestId,
    chainId: overrides.chainId || DEFAULT_PAYMENT.chainId,
    network: overrides.network || `eip155:${overrides.chainId || DEFAULT_PAYMENT.chainId}`,
    recipient: overrides.recipient || DEFAULT_PAYMENT.recipient,
    amountWei: overrides.amountWei || DEFAULT_PAYMENT.amountWei,
    minConfirmations: overrides.minConfirmations ?? DEFAULT_PAYMENT.minConfirmations,
  });
  const txBlock = overrides.txBlock ?? 100n;
  const latestBlock = overrides.latestBlock ?? txBlock;

  return {
    txHash,
    payment,
    rpcMaxRetries: overrides.rpcMaxRetries,
    handlers: {
      eth_getTransactionByHash:
        overrides.eth_getTransactionByHash ||
        (() => ({
          hash: txHash,
          to: payment.recipient,
          value: toHex(payment.amountWei),
          blockNumber: toHex(txBlock),
        })),
      eth_getTransactionReceipt:
        overrides.eth_getTransactionReceipt ||
        (() => ({
          transactionHash: txHash,
          blockNumber: toHex(txBlock),
          status: "0x1",
        })),
      eth_chainId:
        overrides.eth_chainId ||
        (() => toHex(payment.chainId)),
      eth_blockNumber:
        overrides.eth_blockNumber ||
        (() => toHex(latestBlock)),
    },
  };
}

async function startMockRpcServer(handlers) {
  const calls = [];
  const counts = new Map();
  const server = http.createServer((req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (_error) {
        res.statusCode = 400;
        res.end("invalid json");
        return;
      }

      const method = payload?.method || "";
      counts.set(method, (counts.get(method) || 0) + 1);
      calls.push({ method, params: payload?.params || [] });

      const handler = handlers[method];
      if (!handler) {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: payload?.id || 1,
            error: { code: -32601, message: `Unhandled method: ${method}` },
          })
        );
        return;
      }

      try {
        const result = handler(payload?.params || [], payload);
        const responsePayload =
          result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "error")
            ? { jsonrpc: "2.0", id: payload?.id || 1, error: result.error }
            : { jsonrpc: "2.0", id: payload?.id || 1, result };

        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(responsePayload));
      } catch (error) {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: payload?.id || 1,
            error: { code: -32000, message: error?.message || "rpc handler failure" },
          })
        );
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object" && "port" in address, "mock rpc server should bind to a port");

  return {
    url: `http://127.0.0.1:${address.port}`,
    calls,
    counts,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

async function withMockRpcServer(fixture, callback) {
  const server = await startMockRpcServer(fixture.handlers);
  try {
    const middleware = new ApixMiddleware({
      ...BASE_CONFIG,
      rpcUrl: server.url,
      rpcMaxRetries: fixture.rpcMaxRetries ?? 2,
    });
    return await callback({ middleware, payment: fixture.payment, txHash: fixture.txHash, server });
  } finally {
    await server.close();
  }
}

function testStartRequestMarksPendingAndBlocksDuplicateStart() {
  const { middleware, token, sessionStore } = createMiddlewareWithSession(2);

  assert.equal(middleware.startRequest(token), true);
  assert.equal(middleware.startRequest(token), false);

  const session = sessionStore.get(token);
  assert.equal(session.remainingQuota, 1);
  assert.equal(session.requestState, "pending");
}

function testRollbackOnlyRefundsPendingRequest() {
  const { middleware, token, sessionStore } = createMiddlewareWithSession(1);

  assert.equal(middleware.startRequest(token), true);
  middleware.rollbackRequest(token);
  middleware.rollbackRequest(token);

  const session = sessionStore.get(token);
  assert.equal(session.remainingQuota, 1);
  assert.equal(session.requestState, "idle");
}

function testCommitOnlyTransitionsPendingToIdle() {
  const { middleware, token, sessionStore } = createMiddlewareWithSession(1);

  middleware.commitRequest(token);
  let session = sessionStore.get(token);
  assert.equal(session.requestState, "idle");
  assert.equal(session.remainingQuota, 1);

  assert.equal(middleware.startRequest(token), true);
  middleware.commitRequest(token);

  session = sessionStore.get(token);
  assert.equal(session.requestState, "idle");
  assert.equal(session.remainingQuota, 0);
}

async function testAsyncSessionStateMethodsUseLocalStoreByDefault() {
  const { middleware, token } = createMiddlewareWithSession(1);

  assert.equal(await middleware.validateSessionState(token), true);
  const startResult = await middleware.startRequestStateWithResult(token);
  assert.equal(startResult.started, true);
  assert.equal(startResult.code, "session_started");

  const duplicateResult = await middleware.startRequestStateWithResult(token);
  assert.equal(duplicateResult.started, false);
  assert.equal(duplicateResult.code, "session_request_in_progress");

  await middleware.rollbackRequestState(token);
  assert.equal(await middleware.startRequestState(token), true);
  await middleware.commitRequestState(token);
  assert.equal(await middleware.validateSessionState(token), false);
}

async function testAsyncDuplicateStartAllowsOnlyOneWinner() {
  const { middleware, token, sessionStore } = createMiddlewareWithSession(2);
  const results = await Promise.all([
    middleware.startRequestStateWithResult(token),
    middleware.startRequestStateWithResult(token),
  ]);

  const startedResults = results.filter((result) => result.started);
  const blockedResults = results.filter((result) => !result.started);

  assert.equal(startedResults.length, 1);
  assert.equal(blockedResults.length, 1);
  assert.equal(blockedResults[0].code, "session_request_in_progress");

  const pendingSession = sessionStore.get(token);
  assert.equal(pendingSession.remainingQuota, 1);
  assert.equal(pendingSession.requestState, "pending");

  await middleware.rollbackRequestState(token);

  const restoredSession = sessionStore.get(token);
  assert.equal(restoredSession.remainingQuota, 2);
  assert.equal(restoredSession.requestState, "idle");
}

function testCreatePaymentRequestSnapshot() {
  const middleware = new ApixMiddleware({
    ...BASE_CONFIG,
  });
  const details = createDefaultPayment();
  const response = middleware.createPaymentRequest(details);

  assert.deepEqual(response, {
    headers: {
      "WWW-Authenticate": `Apix realm="Apix Protected", request_id="${details.requestId}", price="${details.amount}", currency="${details.currency}", pay_to="${details.recipient}"`,
      "PAYMENT-REQUIRED": Buffer.from(
        JSON.stringify({
          version: "x402-draft",
          request_id: details.requestId,
          chain_id: details.chainId,
          network: details.network,
          payment_info: {
            currency: details.currency,
            amount: details.amount,
            amount_wei: details.amountWei,
            recipient: details.recipient,
          },
        }),
        "utf8"
      ).toString("base64"),
    },
    body: {
      error: "Payment Required",
      code: "payment_required",
      message: "Payment required to access premium resource.",
      retryable: false,
      request_id: details.requestId,
      details: {
        request_id: details.requestId,
        chain_id: details.chainId,
        network: details.network,
        payment_info: {
          currency: details.currency,
          amount: details.amount,
          amount_wei: details.amountWei,
          recipient: details.recipient,
        },
      },
    },
  });
}

function testConstructorUsesApixDefaultsForChainAndRpc() {
  const middleware = new ApixMiddleware({
    jwtSecret: TEST_SECRET,
    paymentCurrency: DEFAULT_PAYMENT.currency,
    paymentAmount: DEFAULT_PAYMENT.amount,
    paymentAmountWei: DEFAULT_PAYMENT.amountWei,
    paymentRecipient: DEFAULT_PAYMENT.recipient,
  });

  assert.equal(middleware.rpcUrl, "https://subnets.avax.network/apix/testnet/rpc");
  assert.equal(middleware.paymentProfile.chainId, 402);
  assert.equal(middleware.paymentProfile.network, "eip155:402");
}

function testConstructorRejectsMismatchedPaymentNetwork() {
  assert.throws(
    () =>
      new ApixMiddleware({
        ...BASE_CONFIG,
        paymentNetwork: "eip155:43114",
      }),
    /Payment config mismatch: paymentChainId=402 paymentNetwork=eip155:43114/
  );
}

function testConstructorRejectsMissingAmountWei() {
  assert.throws(
    () =>
      new ApixMiddleware({
        ...BASE_CONFIG,
        paymentAmountWei: "",
      }),
    /Missing APIX_PAYMENT_AMOUNT_WEI \(or provide paymentAmountWei in ApixMiddleware config\)\./
  );
}

function testConstructorRejectsInvalidRecipient() {
  assert.throws(
    () =>
      new ApixMiddleware({
        ...BASE_CONFIG,
        paymentRecipient: "not-an-address",
      }),
    /Invalid paymentDetails\.recipient: expected EVM address, got "not-an-address"\./
  );
}

async function testVerifyPaymentSucceedsAndCachesPerRequest() {
  const fixture = createMockRpcFixture();
  await withMockRpcServer(fixture, async ({ middleware, payment, txHash, server }) => {
    const first = await middleware.verifyPayment(txHash, payment);
    assert.equal(first.success, true);
    assert.match(first.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    const second = await middleware.verifyPayment(txHash, payment);
    assert.equal(second.success, true);
    assert.equal(second.token, first.token);
    assert.equal(second.message, "Verification already processed");

    assert.equal(server.counts.get("eth_getTransactionByHash"), 1);
    assert.equal(server.counts.get("eth_getTransactionReceipt"), 1);
    assert.equal(server.counts.get("eth_chainId"), 1);
    assert.equal(server.counts.get("eth_blockNumber"), 1);
  });
}

async function testVerifyPaymentRejectsReuseAcrossRequestIds() {
  const fixture = createMockRpcFixture();
  await withMockRpcServer(fixture, async ({ middleware, payment, txHash }) => {
    const first = await middleware.verifyPayment(txHash, payment);
    assert.equal(first.success, true);

    const second = await middleware.verifyPayment(txHash, {
      ...payment,
      requestId: "req_other_payment",
    });
    assert.equal(second.success, false);
    assert.equal(second.code, "tx_hash_already_used");
    assert.equal(second.retryable, false);
  });
}

async function testVerifyPaymentRequiresPaymentDetails() {
  const fixture = createMockRpcFixture();
  await withMockRpcServer(fixture, async ({ middleware, txHash }) => {
    const result = await middleware.verifyPayment(txHash);
    assert.equal(result.success, false);
    assert.equal(result.code, "invalid_request");
    assert.equal(result.retryable, false);
  });
}

async function testVerifyPaymentFailsWhenTransactionIsMissing() {
  const fixture = createMockRpcFixture({
    eth_getTransactionByHash: () => null,
  });
  await withMockRpcServer(fixture, async ({ middleware, payment, txHash, server }) => {
    const result = await middleware.verifyPayment(txHash, payment);
    assert.equal(result.success, false);
    assert.equal(result.code, "verification_failed");
    assert.equal(result.message, "transaction not found");
    assert.equal(result.retryable, false);
    assert.equal(server.counts.get("eth_getTransactionReceipt") || 0, 0);
  });
}

async function testVerifyPaymentFailsWhenReceiptIsMissing() {
  const fixture = createMockRpcFixture({
    eth_getTransactionReceipt: () => null,
  });
  await withMockRpcServer(fixture, async ({ middleware, payment, txHash }) => {
    const result = await middleware.verifyPayment(txHash, payment);
    assert.equal(result.success, false);
    assert.equal(result.code, "verification_failed");
    assert.equal(result.message, "transaction receipt not found");
  });
}

async function testVerifyPaymentFailsWhenExecutionReverts() {
  const fixture = createMockRpcFixture({
    eth_getTransactionReceipt: () => ({
      transactionHash: `0x${"1".repeat(64)}`,
      blockNumber: toHex(100),
      status: "0x0",
    }),
  });
  await withMockRpcServer(fixture, async ({ middleware, payment, txHash }) => {
    const result = await middleware.verifyPayment(txHash, payment);
    assert.equal(result.success, false);
    assert.equal(result.code, "verification_failed");
    assert.equal(result.message, "transaction execution failed");
  });
}

async function testVerifyPaymentFailsWhenRecipientMismatches() {
  const fixture = createMockRpcFixture({
    eth_getTransactionByHash: () => ({
      hash: `0x${"1".repeat(64)}`,
      to: "0x000000000000000000000000000000000000bEEF",
      value: toHex(DEFAULT_PAYMENT.amountWei),
      blockNumber: toHex(100),
    }),
  });
  await withMockRpcServer(fixture, async ({ middleware, payment, txHash }) => {
    const result = await middleware.verifyPayment(txHash, payment);
    assert.equal(result.success, false);
    assert.equal(result.code, "verification_failed");
    assert.match(result.message, /^recipient mismatch expected=/);
  });
}

async function testVerifyPaymentFailsWhenAmountIsInsufficient() {
  const fixture = createMockRpcFixture({
    eth_getTransactionByHash: () => ({
      hash: `0x${"1".repeat(64)}`,
      to: DEFAULT_PAYMENT.recipient,
      value: toHex(BigInt(DEFAULT_PAYMENT.amountWei) - 1n),
      blockNumber: toHex(100),
    }),
  });
  await withMockRpcServer(fixture, async ({ middleware, payment, txHash }) => {
    const result = await middleware.verifyPayment(txHash, payment);
    assert.equal(result.success, false);
    assert.equal(result.code, "verification_failed");
    assert.match(result.message, /^insufficient payment expected=/);
  });
}

async function testVerifyPaymentFailsWhenNetworkMismatches() {
  const fixture = createMockRpcFixture({
    eth_chainId: () => toHex(43114),
  });
  await withMockRpcServer(fixture, async ({ middleware, payment, txHash }) => {
    const result = await middleware.verifyPayment(txHash, payment);
    assert.equal(result.success, false);
    assert.equal(result.code, "verification_failed");
    assert.equal(result.message, "network mismatch expected_chain=402 rpc_chain=43114");
  });
}

async function testVerifyPaymentFailsWhenConfirmationsAreInsufficient() {
  const fixture = createMockRpcFixture({
    minConfirmations: 3,
    txBlock: 100n,
    latestBlock: 101n,
  });
  await withMockRpcServer(fixture, async ({ middleware, payment, txHash }) => {
    const result = await middleware.verifyPayment(txHash, payment);
    assert.equal(result.success, false);
    assert.equal(result.code, "verification_failed");
    assert.equal(result.message, "insufficient confirmations required=3 actual=2");
  });
}

async function testVerifyPaymentMarksRpcErrorsRetryable() {
  const fixture = createMockRpcFixture({
    rpcMaxRetries: 1,
    eth_getTransactionByHash: () => ({
      error: { code: -32000, message: "transient upstream error" },
    }),
  });
  await withMockRpcServer(fixture, async ({ middleware, payment, txHash, server }) => {
    const result = await middleware.verifyPayment(txHash, payment);
    assert.equal(result.success, false);
    assert.equal(result.code, "verification_failed");
    assert.equal(result.retryable, true);
    assert.equal(
      result.message,
      "rpc error code=-32000 message=transient upstream error"
    );
    assert.equal(server.counts.get("eth_getTransactionByHash"), 2);
  });
}

async function run() {
  testConstructorUsesApixDefaultsForChainAndRpc();
  testConstructorRejectsMismatchedPaymentNetwork();
  testConstructorRejectsMissingAmountWei();
  testConstructorRejectsInvalidRecipient();
  testStartRequestMarksPendingAndBlocksDuplicateStart();
  testRollbackOnlyRefundsPendingRequest();
  testCommitOnlyTransitionsPendingToIdle();
  await testAsyncSessionStateMethodsUseLocalStoreByDefault();
  await testAsyncDuplicateStartAllowsOnlyOneWinner();
  testCreatePaymentRequestSnapshot();
  await testVerifyPaymentSucceedsAndCachesPerRequest();
  await testVerifyPaymentRejectsReuseAcrossRequestIds();
  await testVerifyPaymentRequiresPaymentDetails();
  await testVerifyPaymentFailsWhenTransactionIsMissing();
  await testVerifyPaymentFailsWhenReceiptIsMissing();
  await testVerifyPaymentFailsWhenExecutionReverts();
  await testVerifyPaymentFailsWhenRecipientMismatches();
  await testVerifyPaymentFailsWhenAmountIsInsufficient();
  await testVerifyPaymentFailsWhenNetworkMismatches();
  await testVerifyPaymentFailsWhenConfirmationsAreInsufficient();
  await testVerifyPaymentMarksRpcErrorsRetryable();
  console.log("apix-sdk-node tests passed");
}

run().catch((error) => {
  console.error("apix-sdk-node tests failed");
  console.error(error);
  process.exit(1);
});
