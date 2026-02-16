import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const JWT_SECRET = 'backend-test-secret';

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
    process.env.APIX_FACILITATOR_URL = 'http://127.0.0.1:65535';
    process.env.APIX_METRICS_TOKEN = 'metrics-test-token';

    const proofToken = jwt.sign({
        tx_hash: '0xprefunded',
        max_requests: 3,
        request_id: 'req_seed'
    }, JWT_SECRET, {
        expiresIn: 60,
        issuer: 'test-suite'
    });
    const sessionStorePath = createSeededSessionStore(proofToken);
    process.env.APIX_SESSION_STORE_PATH = sessionStorePath;

    let server: http.Server | null = null;
    try {
        const backendModule: any = await import('./index');
        const app = backendModule?.app || backendModule?.default?.app || backendModule?.default;
        assert.ok(app, 'expected backend app export');

        server = await new Promise((resolve, reject) => {
            const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
            candidate.on('error', reject);
        }) as http.Server;

        const client = request(server);

        const challenge = await client.get('/apix-product');
        assert.equal(challenge.status, 402);
        assert.ok(challenge.headers['www-authenticate']);
        assert.ok(challenge.headers['payment-required']);

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

        const metricsUnauthorized = await client.get('/metrics');
        assert.equal(metricsUnauthorized.status, 401);

        const metricsAuthorized = await client
            .get('/metrics')
            .set('Authorization', 'Bearer metrics-test-token');
        assert.equal(metricsAuthorized.status, 200);

        console.log('demo/backend tests passed');
    } catch (error: any) {
        if (error?.code === 'EPERM') {
            console.warn('demo/backend tests skipped: listen permission denied in current environment');
            return;
        }
        throw error;
    } finally {
        if (server) {
            await new Promise((resolve) => server?.close(() => resolve(undefined)));
        }
        fs.rmSync(sessionStorePath, { force: true });
    }
}

run().catch((error) => {
    console.error('demo/backend tests failed');
    console.error(error);
    process.exit(1);
});
