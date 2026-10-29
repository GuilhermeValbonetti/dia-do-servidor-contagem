import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import { resetProjection, startProjection, subscribeProjection, prepareProjection, } from '../src/services/projection.service.js';
test('telões compartilham animação, revelação, reconexão e preparação manual', { timeout: 10_000 }, async () => {
    const app = express();
    app.get('/events', (_req, res) => subscribeProjection(res));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    const controllers = [];
    async function connect() {
        const controller = new AbortController();
        controllers.push(controller);
        const response = await fetch(`http://127.0.0.1:${address && typeof address !== 'string' ? address.port : 0}/events`, { signal: controller.signal });
        assert.equal(response.status, 200);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        return async () => {
            while (!buffer.includes('\n\n')) {
                const chunk = await reader.read();
                assert(!chunk.done);
                buffer += decoder.decode(chunk.value, { stream: true });
            }
            const end = buffer.indexOf('\n\n');
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            return JSON.parse(frame.slice('data: '.length));
        };
    }
    try {
        resetProjection();
        const first = await connect();
        const second = await connect();
        assert.equal((await first()).phase, 'ready');
        assert.equal((await second()).phase, 'ready');
        const result = {
            id: 42, participantId: 7, prizeId: null, drawnAt: new Date(),
            participant: { id: 7, name: 'Teste', registrationNumber: '123', publicAgency: 'PREFEITURA', department: 'SETOR DE TESTE', present: true, participationNumber: 0 },
            prize: null,
        };
        startProjection(result, 1);
        assert.throws(() => prepareProjection(), /Aguarde/);
        for (const read of [first, second]) {
            const state = await read();
            assert.equal(state.phase, 'drawing');
            assert.equal(state.result, undefined, 'não antecipa o vencedor');
        }
        await delay(100);
        const late = await connect();
        const snapshot = await late();
        assert.equal(snapshot.phase, 'drawing');
        assert(snapshot.elapsedMs >= 100);
        assert.equal(snapshot.result, undefined);
        const winners = await Promise.all([first(), second(), late()]);
        for (const state of winners) {
            assert.equal(state.phase, 'winner');
            assert.equal(state.result.id, 42);
            assert.equal(state.result.participant.department, 'SETOR DE TESTE');
            assert.equal(state.snapshot, false);
        }
        const reconnected = await connect();
        const restored = await reconnected();
        assert.equal(restored.phase, 'winner');
        assert.equal(restored.snapshot, true);
        await delay(50);
        prepareProjection();
        for (const state of await Promise.all([first(), second(), late(), reconnected()])) {
            assert.equal(state.phase, 'preparing');
            assert.equal(state.result.id, 42);
        }
    }
    finally {
        controllers.forEach((controller) => controller.abort());
        resetProjection();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(() => resolve()));
    }
});
