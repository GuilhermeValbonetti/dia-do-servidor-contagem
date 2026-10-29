import { Router } from 'express';
import { AppError } from '../errors/app-error.js';
import { cancelDrawSession, completeDrawSession, drawRandomWinner, listDraws, getDrawByParticipantId, resetDrawHistory, startDrawSession, } from '../services/draws.service.js';
const router = Router();
function parsePrizeId(value) {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value <= 0) {
        throw new AppError(400, 'ID do prêmio inválido.');
    }
    return value;
}
function parseSessionId(value) {
    if (typeof value !== 'string' || !value) {
        throw new AppError(400, 'ID da sessão de sorteio inválido.');
    }
    return value;
}
// POST /api/draws/sessions - Start a cancelable draw session.
router.post('/sessions', async (req, res, next) => {
    try {
        const session = await startDrawSession(parsePrizeId(req.body?.prizeId));
        res.status(201).json({
            mensagem: 'Sessão de sorteio iniciada.',
            sessao: session,
        });
    }
    catch (error) {
        next(error);
    }
});
// POST /api/draws/sessions/:id/cancel - Cancel before the result is committed.
router.post('/sessions/:id/cancel', async (req, res, next) => {
    try {
        cancelDrawSession(parseSessionId(req.params.id));
        res.status(200).json({
            mensagem: 'Sorteio cancelado. Nenhum resultado foi registrado.',
            cancelado: true,
        });
    }
    catch (error) {
        next(error);
    }
});
// POST /api/draws/sessions/:id/complete - Select and persist the official winner.
router.post('/sessions/:id/complete', async (req, res, next) => {
    try {
        const draw = await completeDrawSession(parseSessionId(req.params.id));
        res.status(201).json({
            mensagem: 'Sorteio realizado com sucesso.',
            sorteio: draw,
        });
    }
    catch (error) {
        next(error);
    }
});
// POST /api/draws - Conduct a prize draw, with or without an associated prize
router.post('/', async (req, res, next) => {
    try {
        const draw = await drawRandomWinner(parsePrizeId(req.body?.prizeId));
        res.status(201).json({
            mensagem: 'Sorteio realizado com sucesso.',
            sorteio: draw,
        });
    }
    catch (error) {
        next(error);
    }
});
// GET /api/draws - Lists all draws that have taken place
router.get('/', async (_req, res, next) => {
    try {
        const draws = await listDraws();
        res.status(200).json({
            mensagem: 'Sorteios encontrados com sucesso.',
            total: draws.length,
            sorteios: draws,
        });
    }
    catch (error) {
        next(error);
    }
});
router.post('/reset', async (_req, res, next) => {
    try {
        const result = await resetDrawHistory();
        res.status(200).json({
            mensagem: 'Aplicação reiniciada com sucesso.',
            ...result,
        });
    }
    catch (error) {
        next(error);
    }
});
// GET /api/draws/participant/:id - Check the draw associated with a participant
router.get('/participant/:id', async (req, res, next) => {
    try {
        const participantId = Number(req.params.id);
        if (!Number.isSafeInteger(participantId) || participantId <= 0) {
            throw new AppError(400, 'ID do participante inválido.');
        }
        const draw = await getDrawByParticipantId(participantId);
        if (!draw) {
            throw new AppError(404, 'Nenhum sorteio encontrado para este participante.');
        }
        res.status(200).json({
            mensagem: 'Sorteio encontrado com sucesso.',
            sorteio: draw,
        });
    }
    catch (error) {
        next(error);
    }
});
export default router;
