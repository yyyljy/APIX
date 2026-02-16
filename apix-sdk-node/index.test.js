const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { ApixMiddleware } = require("./index.js");

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

function createMiddlewareWithSession(quota = 2) {
  const secret = "unit-test-secret";
  const sessionStore = createTestStore();
  const middleware = new ApixMiddleware({
    jwtSecret: secret,
    facilitatorUrl: "http://localhost:8080",
    sessionStore,
  });
  const token = jwt.sign({ max_requests: quota }, secret, { expiresIn: "1h" });

  sessionStore.set(token, {
    claims: jwt.decode(token),
    remainingQuota: quota,
    requestState: "idle",
  });

  return { middleware, token, sessionStore };
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
  assert.equal(await middleware.startRequestState(token), true);
  await middleware.rollbackRequestState(token);
  assert.equal(await middleware.startRequestState(token), true);
  await middleware.commitRequestState(token);
  assert.equal(await middleware.validateSessionState(token), false);
}

async function run() {
  testStartRequestMarksPendingAndBlocksDuplicateStart();
  testRollbackOnlyRefundsPendingRequest();
  testCommitOnlyTransitionsPendingToIdle();
  await testAsyncSessionStateMethodsUseLocalStoreByDefault();
  console.log("apix-sdk-node tests passed");
}

run().catch((error) => {
  console.error("apix-sdk-node tests failed");
  console.error(error);
  process.exit(1);
});
