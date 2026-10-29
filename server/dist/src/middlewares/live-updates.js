const clients = new Set();
export const subscribeToUpdates = (_req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    clients.add(res);
    res.write('data: connected\n\n');
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20_000);
    heartbeat.unref();
    res.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(res);
    });
};
export const publishUpdates = (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        res.on('finish', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                for (const client of clients)
                    client.write('data: updated\n\n');
            }
        });
    }
    next();
};
