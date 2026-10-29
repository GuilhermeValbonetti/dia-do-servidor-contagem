import { randomInt, randomUUID } from 'node:crypto';
import { prisma } from '../database/prisma.js';
import { AppError } from '../errors/app-error.js';
import { isProjectionDrawing, startProjection, resetProjection } from './projection.service.js';

const DRAW_SESSION_TIMEOUT_MS = 60_000;
const DRAW_SESSION_RETENTION_MS = 5 * 60_000;

type DrawSessionStatus =
  | 'starting'
  | 'active'
  | 'completing'
  | 'cancelled'
  | 'completed'
  | 'expired'
  | 'failed';

interface DrawSession {
  id: string;
  prizeId?: number;
  status: DrawSessionStatus;
  result?: Awaited<ReturnType<typeof drawRandomWinner>>;
  timer?: ReturnType<typeof setTimeout>;
}

const drawSessions = new Map<string, DrawSession>();
let activeDrawSessionId: string | null = null;
let selectingWinner = false;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

const drawSelect = {
  id: true,
  participantId: true,
  prizeId: true,
  drawnAt: true,
  participant: {
    select: {
      id: true,
      name: true,
      registrationNumber: true,
      publicAgency: true,
      department: true,
      present: true,
      participationNumber: true,
    },
  },
  prize: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

export async function drawRandomWinner(prizeId?: number) {
  if (selectingWinner || isProjectionDrawing()) throw new AppError(409, 'Aguarde a apresentação do sorteio em andamento.');
  if (
    prizeId !== undefined &&
    (!Number.isSafeInteger(prizeId) || prizeId <= 0)
  ) {
    throw new AppError(400, 'ID do prêmio inválido.');
  }

  selectingWinner = true;
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const eligibleParticipants = await transaction.participant.findMany({
        where: {
          present: true,
          participationNumber: { not: null },
          draw: null,
        },
        select: { id: true },
        orderBy: { participationNumber: 'asc' },
      });

      if (eligibleParticipants.length === 0) {
        throw new AppError(
          409,
          'Não há participantes presentes e elegíveis para o sorteio.',
        );
      }

      const selectedParticipant =
        eligibleParticipants[randomInt(eligibleParticipants.length)];

      if (!selectedParticipant) {
        throw new Error('Falha ao selecionar participante elegível.');
      }

      if (prizeId !== undefined) {
        const prizeUpdate = await transaction.prize.updateMany({
          where: {
            id: prizeId,
            quantityAvailable: { gt: 0 },
          },
          data: {
            quantityAvailable: { decrement: 1 },
          },
        });

        if (prizeUpdate.count === 0) {
          const prize = await transaction.prize.findUnique({
            where: { id: prizeId },
            select: { id: true },
          });

          if (!prize) {
            throw new AppError(404, 'Prêmio não encontrado.');
          }

          throw new AppError(
            409,
            'Não há unidades disponíveis deste prêmio.',
          );
        }
      }

      const draw = await transaction.draw.create({
        data: {
          participantId: selectedParticipant.id,
          ...(prizeId !== undefined ? { prizeId } : {}),
        },
        select: drawSelect,
      });
      return { draw, drawNumber: await transaction.draw.count() };
    });
    startProjection(result.draw, result.drawNumber);
    return result.draw;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(
        409,
        'O participante selecionado já ganhou anteriormente. Tente realizar o sorteio novamente.',
      );
    }

    throw error;
  } finally {
    selectingWinner = false;
  }
}

function validatePrizeId(prizeId?: number): void {
  if (
    prizeId !== undefined &&
    (!Number.isSafeInteger(prizeId) || prizeId <= 0)
  ) {
    throw new AppError(400, 'ID do prêmio inválido.');
  }
}

function scheduleSessionCleanup(session: DrawSession): void {
  if (session.timer) {
    clearTimeout(session.timer);
  }

  session.timer = setTimeout(() => {
    drawSessions.delete(session.id);
  }, DRAW_SESSION_RETENTION_MS);
  session.timer.unref();
}

export async function startDrawSession(prizeId?: number) {
  if (isProjectionDrawing()) throw new AppError(409, 'Aguarde a apresentação do sorteio em andamento.');
  validatePrizeId(prizeId);

  if (activeDrawSessionId) {
    const activeSession = drawSessions.get(activeDrawSessionId);
    if (
      activeSession?.status === 'starting' ||
      activeSession?.status === 'active' ||
      activeSession?.status === 'completing'
    ) {
      throw new AppError(409, 'Já existe um sorteio em andamento.');
    }

    activeDrawSessionId = null;
  }

  const session: DrawSession = {
    id: randomUUID(),
    ...(prizeId !== undefined ? { prizeId } : {}),
    status: 'starting',
  };
  drawSessions.set(session.id, session);
  activeDrawSessionId = session.id;

  try {
    const eligibleCount = await prisma.participant.count({
      where: {
        present: true,
        participationNumber: { not: null },
        draw: null,
      },
    });

    if (eligibleCount === 0) {
      throw new AppError(
        409,
        'Não há participantes presentes e elegíveis para o sorteio.',
      );
    }

    if (prizeId !== undefined) {
      const prize = await prisma.prize.findUnique({
        where: { id: prizeId },
        select: { quantityAvailable: true },
      });

      if (!prize) {
        throw new AppError(404, 'Prêmio não encontrado.');
      }

      if (prize.quantityAvailable <= 0) {
        throw new AppError(409, 'Não há unidades disponíveis deste prêmio.');
      }
    }

    session.status = 'active';
    session.timer = setTimeout(() => {
      if (session.status === 'active') {
        session.status = 'expired';
        activeDrawSessionId = null;
        scheduleSessionCleanup(session);
      }
    }, DRAW_SESSION_TIMEOUT_MS);
    session.timer.unref();
  } catch (error) {
    session.status = 'failed';
    activeDrawSessionId = null;
    scheduleSessionCleanup(session);
    throw error;
  }

  return {
    id: session.id,
    prizeId: session.prizeId ?? null,
    expiresInMs: DRAW_SESSION_TIMEOUT_MS,
  };
}

export function cancelDrawSession(sessionId: string): void {
  const session = drawSessions.get(sessionId);

  if (!session) {
    throw new AppError(404, 'Sessão de sorteio não encontrada ou expirada.');
  }

  if (session.status === 'cancelled') {
    return;
  }

  if (session.status !== 'active') {
    throw new AppError(
      409,
      'O sorteio já está sendo concluído e não pode mais ser cancelado.',
    );
  }

  session.status = 'cancelled';
  if (session.timer) {
    clearTimeout(session.timer);
  }
  if (activeDrawSessionId === session.id) {
    activeDrawSessionId = null;
  }
  scheduleSessionCleanup(session);
}

export async function completeDrawSession(sessionId: string) {
  const session = drawSessions.get(sessionId);

  if (!session) {
    throw new AppError(404, 'Sessão de sorteio não encontrada ou expirada.');
  }

  if (session.status === 'completed' && session.result) {
    return session.result;
  }

  if (session.status !== 'active') {
    throw new AppError(409, 'A sessão de sorteio não está ativa.');
  }

  session.status = 'completing';
  if (session.timer) {
    clearTimeout(session.timer);
  }

  try {
    session.result = await drawRandomWinner(session.prizeId);
    session.status = 'completed';
    return session.result;
  } catch (error) {
    session.status = 'failed';
    throw error;
  } finally {
    if (activeDrawSessionId === session.id) {
      activeDrawSessionId = null;
    }
    scheduleSessionCleanup(session);
  }
}

export async function listDraws() {
  return prisma.draw.findMany({
    select: drawSelect,
    orderBy: { drawnAt: 'asc' },
  });
}

export async function resetDrawHistory() {
  if (selectingWinner || isProjectionDrawing()) throw new AppError(409, 'Aguarde a apresentação do sorteio em andamento.');
  const activeSession = activeDrawSessionId
    ? drawSessions.get(activeDrawSessionId)
    : undefined;

  if (
    activeSession?.status === 'starting' ||
    activeSession?.status === 'active' ||
    activeSession?.status === 'completing'
  ) {
    throw new AppError(409, 'Finalize ou cancele o sorteio em andamento antes de reiniciar.');
  }

  const result = await prisma.$transaction(async (transaction) => {
    const prizes = await transaction.prize.findMany({
      select: { id: true, quantityTotal: true },
    });
    const { count: deletedDraws } = await transaction.draw.deleteMany();
    const { count: resetParticipants } =
      await transaction.participant.updateMany({
        where: {
          OR: [
            { present: true },
            { confirmedAt: { not: null } },
            { participationNumber: { not: null } },
          ],
        },
        data: {
          present: false,
          confirmedAt: null,
          participationNumber: null,
        },
      });

    for (const prize of prizes) {
      await transaction.prize.update({
        where: { id: prize.id },
        data: { quantityAvailable: prize.quantityTotal },
      });
    }

    return { deletedDraws, resetParticipants };
  });
  resetProjection();
  return result;
}

export async function getDrawByParticipantId(participantId: number) {
  if (!Number.isSafeInteger(participantId) || participantId <= 0) {
    throw new AppError(400, 'ID do participante inválido.');
  }

  return prisma.draw.findUnique({
    where: { participantId },
    select: drawSelect,
  });
}
