import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const JWT_SECRET = 'backend-test-secret';

// createSeededSessionStore: helper function.
function createSeededSessionStore(token: string): string {
    const filePath = path.join(os.tmpdir(), `apix-session-store-${Date.now()}.json`);
    const claims = jwt.decode(token);
    const snapshot = {
        [token]: {
            claims,
            remainingQuota: 3,
            requestState: 'idle'
        }
    };
    fs.writeFileSync(filePath, JSON.stringify(snapshot), { encoding: 'utf8' });
    return filePath;
}

async function run() {
    process.env.NODE_ENV = 'test';
    process.env.APIX_JWT_SECRET = JWT_SECRET;
    process.env.APIX_VERIFICATION_RPC_URL = 'https://subnets.avax.network/apix/testnet/rpc';
    process.env.APIX_METRICS_TOKEN = 'metrics-test-token';
    process.env.APIX_PROVIDER_TOKEN = 'provider-token-for-test';

    const proofToken = jwt.sign({
        tx_hash: '0xprefunded',
        max_requests: 3,
        request_id: 'req_seed'
    }, JWT_SECRET, {
        expiresIn: 60,
        issuer: 'test-suite'
    });
    const sessionStorePath = createSeededSessionStore(proofToken);
    const faucetStorePath = path.join(os.tmpdir(), `apix-faucet-store-${Date.now()}.json`);
    process.env.APIX_SESSION_STORE_PATH = sessionStorePath;
    process.env.APIX_FAUCET_STORE_PATH = faucetStorePath;
    process.env.APIX_FAUCET_MOCK_TX_HASH = `0x${'1'.repeat(64)}`;
    process.env.APIX_FAUCET_AMOUNT = '10';
    process.env.APIX_FAUCET_TOKEN_DECIMALS = '18';
    process.env.APIX_FAUCET_COOLDOWN_SECONDS = '86400';
    process.env.APIX_CHAIN_ID = '402';
    process.env.APIX_NETWORK = 'eip155:402';
    process.env.APIX_PAYMENT_CURRENCY = 'APIX';
    process.env.APIX_PAYMENT_AMOUNT = '0.1';
    process.env.APIX_PAYMENT_AMOUNT_WEI = '100000000000000000';
    process.env.APIX_PAYMENT_RECIPIENT = '0x0B3F82F42d05cEb8E4b33180Af782c0ccbDB25FC';

    let server: http.Server | null = null;
    try {
        const backendModule: any = await import('./index');
        const app = backendModule?.app || backendModule?.default?.app || backendModule?.default;
        assert.ok(app, 'expected backend app export');

        server = app.listen(0, '127.0.0.1');
        await new Promise<void>((resolve, reject) => {
            server?.once('listening', () => resolve());
            server?.once('error', reject);
        });
        assert.ok(server, 'expected test server instance');
        assert.ok(server.address() && typeof server.address() !== 'string', 'Test server should have address object');

        const client = request(server);

        const challenge = await client.get('/apix-product');
        assert.equal(challenge.status, 402);
        assert.ok(challenge.headers['www-authenticate']);
        assert.ok(challenge.headers['payment-required']);
        assert.ok(challenge.headers['x-request-id']);
        assert.equal(challenge.body?.code, 'payment_required');
        assert.equal(challenge.body?.request_id, challenge.headers['x-request-id']);
        assert.equal(challenge.body?.details?.chain_id, 402);
        assert.equal(challenge.body?.details?.network, 'eip155:402');
        assert.equal(challenge.body?.details?.payment_info?.currency, 'APIX');
        const challengeHeader = JSON.parse(
            Buffer.from(String(challenge.headers['payment-required']), 'base64').toString('utf8')
        );
        assert.equal(challengeHeader?.version, 'x402-draft');
        assert.equal(challengeHeader?.request_id, challenge.headers['x-request-id']);
        assert.equal(challengeHeader?.chain_id, 402);
        assert.equal(challengeHeader?.network, 'eip155:402');
        assert.equal(challengeHeader?.payment_info?.currency, 'APIX');

        const validSession = await client
            .get('/apix-product')
            .set('Authorization', `Apix ${proofToken}`);
        assert.equal(validSession.status, 200);
        assert.equal(validSession.body?.method, 'Apix');

        const secondUse = await client
            .get('/apix-product')
            .set('Authorization', `Apix ${proofToken}`);
        assert.equal(secondUse.status, 200);

        const invalidSession = await client
            .get('/apix-product')
            .set('Authorization', 'Apix invalid.jwt.token');
        assert.equal(invalidSession.status, 403);
        assert.equal(invalidSession.body?.code, 'invalid_apix_session');

        const metricsUnauthorized = await client.get('/metrics');
        assert.equal(metricsUnauthorized.status, 401);

        const metricsAuthorized = await client
            .get('/metrics')
            .set('Authorization', 'Bearer metrics-test-token');
        assert.equal(metricsAuthorized.status, 200);

        const invalidFaucet = await client
            .post('/faucet/claim')
            .send({ walletAddress: 'invalid-wallet' });
        assert.equal(invalidFaucet.status, 400);

        const targetWallet = '0x1111111111111111111111111111111111111111';
        const faucetSuccess = await client
            .post('/faucet/claim')
            .send({ walletAddress: targetWallet });
        assert.equal(faucetSuccess.status, 200);
        assert.equal(faucetSuccess.body?.tx_hash, process.env.APIX_FAUCET_MOCK_TX_HASH);
        assert.equal(faucetSuccess.body?.wallet, targetWallet);

        const faucetCooldown = await client
            .post('/faucet/claim')
            .send({ walletAddress: targetWallet });
        assert.equal(faucetCooldown.status, 429);

        console.log('demo/backend tests passed');
    } catch (error: any) {
        if (error?.code === 'EPERM') {
            console.warn('demo/backend tests skipped: listen permission denied in current environment');
            return;
        }
        throw error;
    } finally {
        if (server) {
            if (server.listening) {
                await new Promise((resolve, reject) => {
                    server?.close((error?: Error | any) => {
                        if (error && (error as any)?.code !== 'ERR_SERVER_NOT_RUNNING') {
                            reject(error);
                            return;
                        }
                        resolve(undefined);
                    });
                });
            }
        }
        fs.rmSync(sessionStorePath, { force: true });
        fs.rmSync(faucetStorePath, { force: true });
    }
}

run().catch((error) => {
    console.error('demo/backend tests failed');
    console.error(error);
    process.exit(1);
});
