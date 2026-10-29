import { Router } from 'express';
import { listDraws } from '../services/draws.service.js';
import { hasProjectionState, initializeProjection, subscribeProjection, prepareProjection } from '../services/projection.service.js';

const router = Router();
router.get('/events', async (_req, res, next) => {
  try {
    if (!hasProjectionState()) initializeProjection(await listDraws());
    subscribeProjection(res);
  } catch (error) { next(error); }
});
router.post('/prepare', async (_req, res, next) => {
  try {
    if (!hasProjectionState()) initializeProjection(await listDraws());
    prepareProjection();
    res.sendStatus(204);
  } catch (error) { next(error); }
});
export default router;
