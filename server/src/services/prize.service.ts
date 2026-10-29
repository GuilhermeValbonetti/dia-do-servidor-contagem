import { prisma } from '../database/prisma.js';
import { AppError } from '../errors/app-error.js';

function assertPrizeId(id: number): void {
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new AppError(400, 'ID do prêmio inválido.');
    }
}

function assertPositiveQuantity(quantity: number, label: string): void {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        throw new AppError(
            400,
            `${label} deve ser um número inteiro positivo.`,
        );
    }
}

const prizeSelect = {
  id: true,
  name: true,
  description: true,
  quantityTotal: true,
  quantityAvailable: true,
} as const;

export async function listPrizes() {
    return prisma.prize.findMany({
        select: prizeSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
}

export async function getPrizeById(id: number) {
    assertPrizeId(id);

    return prisma.prize.findUnique({
        where: { id },
        select: prizeSelect,
    });
}

export async function createPrize(
    name: string,
    quantityTotal: number,
    description?: string,
) {
    if (typeof name !== 'string') {
        throw new AppError(400, 'Nome do prêmio inválido.');
    }

    if (description !== undefined && typeof description !== 'string') {
        throw new AppError(400, 'Descrição do prêmio inválida.');
    }

    const normalizedName = name.trim();
    if (!normalizedName) {
        throw new AppError(400, 'Nome do prêmio é obrigatório.');
    }
    assertPositiveQuantity(quantityTotal, 'Quantidade total');

    return prisma.prize.create({
        data: {
            name: normalizedName,
            description: description?.trim() || null,
            quantityTotal,
            quantityAvailable: quantityTotal,
        },
        select: prizeSelect,
    });
}

export async function addPrizeQuantity(id: number, quantityToAdd: number) {
    assertPrizeId(id);
    assertPositiveQuantity(quantityToAdd, 'Quantidade a adicionar');

    return prisma.$transaction(async (transaction) => {
        const prize = await transaction.prize.findUnique({
            where: { id },
            select: { quantityTotal: true, quantityAvailable: true },
        });

        if (!prize) {
            throw new AppError(404, 'Prêmio não encontrado.');
        }

        if (
            !Number.isSafeInteger(prize.quantityTotal + quantityToAdd) ||
            !Number.isSafeInteger(prize.quantityAvailable + quantityToAdd)
        ) {
            throw new AppError(
                400,
                'A quantidade resultante excede o limite permitido.',
            );
        }

        return transaction.prize.update({
            where: { id },
            data: {
                quantityTotal: { increment: quantityToAdd },
                quantityAvailable: { increment: quantityToAdd },
            },
            select: prizeSelect,
        });
    });
}

export async function removePrizeQuantity(id: number, quantityToRemove: number) {
    assertPrizeId(id);
    assertPositiveQuantity(quantityToRemove, 'Quantidade a remover');

    return prisma.$transaction(async (transaction) => {
        const update = await transaction.prize.updateMany({
            where: {
                id,
                quantityAvailable: { gte: quantityToRemove },
                quantityTotal: { gte: quantityToRemove },
            },
            data: {
                quantityTotal: { decrement: quantityToRemove },
                quantityAvailable: { decrement: quantityToRemove },
            },
        });

        if (update.count === 0) {
            const prize = await transaction.prize.findUnique({
                where: { id },
                select: { id: true },
            });

            if (!prize) {
                throw new AppError(404, 'Prêmio não encontrado.');
            }

            throw new AppError(
                409,
                'A quantidade a remover excede o estoque disponível.',
            );
        }

        return transaction.prize.findUniqueOrThrow({
            where: { id },
            select: prizeSelect,
        });
    });
}

export async function deletePrize(id: number) {
    assertPrizeId(id);

    return prisma.$transaction(async (transaction) => {
        const prize = await transaction.prize.findUnique({
            where: { id },
            select: {
                id: true,
                draws: { select: { id: true }, take: 1 },
            },
        });

        if (!prize) {
            throw new AppError(404, 'Prêmio não encontrado.');
        }

        if (prize.draws.length > 0) {
            throw new AppError(
                409,
                'Não é possível excluir um prêmio que já foi vinculado a um sorteio.',
            );
        }

        return transaction.prize.delete({
            where: { id },
            select: prizeSelect,
        });
    });
}

export async function deleteAllPrizes() {
      return prisma.$transaction(async (transaction) => {
          await transaction.draw.updateMany({
              where: { prizeId: { not: null } },
              data: { prizeId: null },
          });

          const { count } = await transaction.prize.deleteMany();
          return { deletedPrizes: count };
      });
}
