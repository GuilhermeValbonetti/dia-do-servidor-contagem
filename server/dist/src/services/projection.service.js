import { AppError } from '../errors/app-error.js';
const clients = new Set();
let state = null;
let revealTimer;
const ANIMATION_DURATION_MS = 2800;
function send(client, snapshot = false) {
    client.write(`data: ${JSON.stringify({
        ...state,
        snapshot,
        elapsedMs: state?.startedAt ? Date.now() - state.startedAt : 0,
    })}\n\n`);
}
function publish() {
    for (const client of clients)
        send(client);
}
export function hasProjectionState() { return state !== null; }
export function initializeProjection(history) {
    if (state)
        return;
    const result = history.at(-1);
    state = result
        ? { phase: 'winner', drawNumber: history.length, result }
        : { phase: 'ready', drawNumber: 1 };
}
export function subscribeProjection(client) {
    client.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    client.flushHeaders();
    clients.add(client);
    send(client, true);
    const heartbeat = setInterval(() => client.write(': heartbeat\n\n'), 20_000);
    heartbeat.unref();
    client.on('close', () => { clearInterval(heartbeat); clients.delete(client); });
}
export function isProjectionDrawing() { return state?.phase === 'drawing'; }
export function startProjection(result, drawNumber) {
    clearTimeout(revealTimer);
    state = { phase: 'drawing', drawNumber, startedAt: Date.now() };
    // O resultado só é enviado aos telões depois da animação compartilhada.
    publish();
    revealTimer = setTimeout(() => {
        state = { phase: 'winner', drawNumber, result };
        publish();
    }, ANIMATION_DURATION_MS);
    revealTimer.unref();
}
export function prepareProjection() {
    if (state?.phase === 'preparing')
        return;
    if (state?.phase !== 'winner')
        throw new AppError(409, 'Aguarde a revelação do vencedor.');
    state = { ...state, phase: 'preparing' };
    publish();
}
export function resetProjection() {
    clearTimeout(revealTimer);
    state = { phase: 'ready', drawNumber: 1 };
    publish();
}
