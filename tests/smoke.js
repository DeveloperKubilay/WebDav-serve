const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebDAVServer } = require('../server');

const TEST_PORT = 18080;
const TEST_FILE = '/test-smoke.txt';
const TEST_FILE_PATH = path.join(__dirname, '..', 'files', TEST_FILE.slice(1));

async function main() {
    const server = new WebDAVServer();
    await startServer(server, TEST_PORT);

    try {
        await prepareTestFile();
        await runPutTests();
        await runHeadTest();
        await runLockUnlockTest();
        console.log('✅ Smoke testleri başarıyla tamamlandı');
    } catch (error) {
        console.error('❌ Smoke test hatası:', error);
        process.exitCode = 1;
    } finally {
        await stopServer(server);
    }
}

async function prepareTestFile() {
    await fs.promises.rm(TEST_FILE_PATH, { force: true });
}

async function runPutTests() {
    const body = Buffer.from('smoke-test');

    const first = await httpRequest({
        method: 'PUT',
        path: TEST_FILE,
        headers: {
            'Content-Length': body.length
        },
        body
    });

    if (first.statusCode !== 201) {
        throw new Error(`PUT ilk istek beklenen 201 yerine ${first.statusCode}`);
    }

    const second = await httpRequest({
        method: 'PUT',
        path: TEST_FILE,
        headers: {
            'Content-Length': body.length
        },
        body
    });

    if (second.statusCode !== 204) {
        throw new Error(`PUT ikinci istek beklenen 204 yerine ${second.statusCode}`);
    }
}

async function runHeadTest() {
    const head = await httpRequest({
        method: 'HEAD',
        path: TEST_FILE
    });

    if (head.statusCode !== 200) {
        throw new Error(`HEAD isteği beklenen 200 yerine ${head.statusCode}`);
    }

    if (head.headers['content-length'] !== '10') {
        throw new Error(`HEAD content-length 10 olmalı, gelen: ${head.headers['content-length']}`);
    }
}

async function runLockUnlockTest() {
    const lock = await httpRequest({
        method: 'LOCK',
        path: TEST_FILE,
        headers: {
            'Timeout': 'Second-600',
            'Depth': '0'
        },
        body: Buffer.from('<?xml version="1.0" encoding="utf-8"?><D:lockinfo xmlns:D="DAV:"></D:lockinfo>')
    });

    if (lock.statusCode !== 200) {
        throw new Error(`LOCK isteği beklenen 200 yerine ${lock.statusCode}`);
    }

    const tokenHeader = lock.headers['lock-token'];
    if (!tokenHeader) {
        throw new Error('LOCK cevabında Lock-Token headerı yok');
    }

    const unlock = await httpRequest({
        method: 'UNLOCK',
        path: TEST_FILE,
        headers: {
            'Lock-Token': tokenHeader
        }
    });

    if (unlock.statusCode !== 204) {
        throw new Error(`UNLOCK isteği beklenen 204 yerine ${unlock.statusCode}`);
    }
}

function startServer(server, port) {
    return new Promise(resolve => {
        server.start(port);
        server.server.once('listening', resolve);
    });
}

function stopServer(server) {
    return new Promise(resolve => {
        server.server.close(() => resolve());
    });
}

function httpRequest({ method, path: requestPath, headers = {}, body }) {
    const options = {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: requestPath,
        method,
        headers
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks)
                });
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(body);
        }

        req.end();
    });
}

main();
