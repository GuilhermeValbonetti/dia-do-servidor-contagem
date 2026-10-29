import { prisma } from "../database/prisma.js";
import { AppError } from "../errors/app-error.js";
import { normalizeSearchText } from "../utils/normalize-search-text.js";
function assertParticipantId(id) {
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new AppError(400, "ID do participante inválido.");
    }
}
function isPublicAgency(value) {
    return value === "PREFEITURA" || value === "CAMARA";
}
const participantSelect = {
    id: true,
    name: true,
    registrationNumber: true,
    publicAgency: true,
    department: true,
    present: true,
    confirmedAt: true,
    participationNumber: true,
};
const participantListSelect = {
    ...participantSelect,
    cpf: true,
    draw: {
        select: {
            id: true,
        },
    },
};
function maskCpf(cpf) {
    const digits = cpf.replace(/\D/g, "");
    if (digits.length !== 11) {
        return null;
    }
    return `***.***.***-${digits.slice(-2)}`;
}
function getParticipantWhere(filters = {}) {
    if (typeof filters !== "object" ||
        filters === null ||
        Array.isArray(filters)) {
        throw new AppError(400, "Filtros de participantes inválidos.");
    }
    if (filters.publicAgency !== undefined &&
        !isPublicAgency(filters.publicAgency)) {
        throw new AppError(400, "Órgão público inválido.");
    }
    if (filters.present !== undefined && typeof filters.present !== "boolean") {
        throw new AppError(400, "Filtro de presença inválido.");
    }
    if (filters.search !== undefined && typeof filters.search !== "string") {
        throw new AppError(400, "Filtro de busca inválido.");
    }
    return {
        ...(filters.publicAgency ? { publicAgency: filters.publicAgency } : {}),
        ...(filters.present !== undefined ? { present: filters.present } : {}),
    };
}
function matchesParticipantSearch(participant, search) {
    const normalizedSearch = normalizeSearchText(search);
    const nameTerms = normalizedSearch.split(/\s+/).filter(Boolean);
    const normalizedName = normalizeSearchText(participant.name);
    const matchesName = nameTerms.length > 0 &&
        nameTerms.every((term) => normalizedName.includes(term));
    const matchesRegistrationNumber = participant.registrationNumber
        ?.toLowerCase()
        .includes(search.toLowerCase()) ?? false;
    const digitsOnlySearch = search.replace(/\D/g, "");
    const matchesCpf = digitsOnlySearch.length > 0 &&
        (participant.cpf?.includes(digitsOnlySearch) ?? false);
    return matchesName || matchesRegistrationNumber || matchesCpf;
}
function mapParticipantListResult(participants) {
    return participants.map(({ cpf, draw, ...participant }) => ({
        ...participant,
        cpfMasked: cpf ? maskCpf(cpf) : null,
        isWinner: draw !== null,
    }));
}
// Confirmação define a ordem da fila; ao desconfirmar, remove o número e fecha a lacuna.
export async function toggleParticipantPresence(id) {
    assertParticipantId(id);
    return prisma.$transaction(async (transaction) => {
        const participant = await transaction.participant.findUnique({
            where: { id },
            select: {
                id: true,
                present: true,
                participationNumber: true,
            },
        });
        if (!participant) {
            return null;
        }
        if (!participant.present) {
            const lastNumber = await transaction.participant.aggregate({
                _max: { participationNumber: true },
            });
            const participationNumber = (lastNumber._max.participationNumber ?? -1) + 1;
            return transaction.participant.update({
                where: { id },
                data: {
                    present: true,
                    confirmedAt: new Date(),
                    participationNumber,
                },
                select: participantSelect,
            });
        }
        if (participant.participationNumber === null) {
            throw new AppError(500, `Participante ${id} está confirmado, mas não possui número de participação.`);
        }
        const queue = await transaction.participant.findMany({
            where: { participationNumber: { not: null } },
            select: { id: true, participationNumber: true },
            orderBy: { participationNumber: "asc" },
        });
        if (!queue.some((entry) => entry.id === id)) {
            throw new AppError(500, `Participante ${id} não foi encontrado na fila de participação.`);
        }
        if (queue.some((entry) => entry.participationNumber === null ||
            !Number.isSafeInteger(entry.participationNumber) ||
            entry.participationNumber < 0)) {
            throw new AppError(500, "A fila contém um número de participação inválido.");
        }
        const maxNumber = queue.reduce((maximum, entry) => Math.max(maximum, entry.participationNumber ?? -1), -1);
        const offset = maxNumber + 1;
        if (!Number.isSafeInteger(maxNumber + offset)) {
            throw new AppError(500, "Não foi possível compactar a fila: limite numérico excedido.");
        }
        await transaction.participant.updateMany({
            where: { participationNumber: { not: null } },
            data: { participationNumber: { increment: offset } },
        });
        await transaction.participant.update({
            where: { id },
            data: {
                present: false,
                confirmedAt: null,
                participationNumber: null,
            },
        });
        const remainingQueue = queue.filter((entry) => entry.id !== id);
        for (const [participationNumber, entry] of remainingQueue.entries()) {
            await transaction.participant.update({
                where: { id: entry.id },
                data: { participationNumber },
            });
        }
        return transaction.participant.findUniqueOrThrow({
            where: { id },
            select: participantSelect,
        });
    });
}
export async function listRecentConfirmations() {
    const participants = await prisma.participant.findMany({
        where: {
            present: true,
            confirmedAt: { not: null },
        },
        select: participantListSelect,
        orderBy: [{ confirmedAt: "desc" }, { id: "desc" }],
        take: 8,
    });
    return mapParticipantListResult(participants);
}
// Lista participantes com filtros opcionais combináveis.
export async function listParticipants(filters = {}) {
    const participants = await prisma.participant.findMany({
        where: getParticipantWhere(filters),
        select: participantListSelect,
        orderBy: [{ draw: { id: "desc" } }, { name: "asc" }],
    });
    const search = filters.search?.trim();
    const filteredParticipants = search
        ? participants.filter((participant) => matchesParticipantSearch(participant, search))
        : participants;
    return mapParticipantListResult(filteredParticipants);
}
export async function listParticipantsPage(filters, pagination) {
    const where = getParticipantWhere(filters);
    const { page, pageSize } = pagination;
    if (!Number.isSafeInteger(page) || page <= 0) {
        throw new AppError(400, "Número da página inválido.");
    }
    if (!Number.isSafeInteger(pageSize) || pageSize <= 0 || pageSize > 100) {
        throw new AppError(400, "Tamanho da página inválido.");
    }
    const skip = (page - 1) * pageSize;
    if (!Number.isSafeInteger(skip)) {
        throw new AppError(400, "Número da página excede o limite permitido.");
    }
    const search = filters.search?.trim();
    const orderBy = [
        { draw: { id: "desc" } },
        { present: "desc" },
        { name: "asc" },
        { id: "asc" },
    ];
    let participants;
    let total;
    if (search) {
        const candidates = await prisma.participant.findMany({
            where,
            select: participantListSelect,
            orderBy,
        });
        participants = candidates.filter((participant) => matchesParticipantSearch(participant, search));
        total = participants.length;
    }
    else {
        total = await prisma.participant.count({ where });
        participants = await prisma.participant.findMany({
            where,
            select: participantListSelect,
            orderBy,
            skip,
            take: pageSize,
        });
    }
    const resultTotalPages = Math.ceil(total / pageSize);
    const currentPage = Math.min(page, Math.max(resultTotalPages, 1));
    const pageParticipants = search
        ? participants.slice((currentPage - 1) * pageSize, currentPage * pageSize)
        : participants;
    return {
        participantes: mapParticipantListResult(pageParticipants),
        total,
        paginacao: {
            page: currentPage,
            pageSize,
            totalPages: resultTotalPages,
        },
    };
}
// Service para buscar um participante pelo ID
export async function getParticipantById(id) {
    assertParticipantId(id);
    const participant = await prisma.participant.findUnique({
        where: { id },
        select: participantSelect,
    });
    return participant;
}
// Service para buscar participantes pelo número de registro
export async function getParticipantsByRegistrationNumber(registrationNumber) {
    if (typeof registrationNumber !== "string") {
        throw new AppError(400, "Matrícula inválida.");
    }
    const normalizedRegistrationNumber = registrationNumber.trim();
    if (!normalizedRegistrationNumber) {
        throw new AppError(400, "Matrícula não pode ser vazia.");
    }
    const participants = await prisma.participant.findMany({
        where: {
            registrationNumber: normalizedRegistrationNumber,
        },
        select: participantSelect,
    });
    return participants;
}
// Service para buscar participantes por órgão público
export async function getParticipantsByPublicAgency(publicAgency) {
    if (!isPublicAgency(publicAgency)) {
        throw new AppError(400, "Órgão público inválido.");
    }
    return listParticipants({ publicAgency });
}
// Service para buscar participantes pelo nome
export async function getParticipantsByName(name) {
    if (typeof name !== "string") {
        throw new AppError(400, "Nome inválido.");
    }
    const nameSearch = normalizeSearchText(name).split(/\s+/).filter(Boolean);
    const participants = await prisma.participant.findMany({
        select: participantSelect,
        orderBy: { name: "asc" },
    });
    return participants.filter((participant) => {
        const normalizedName = normalizeSearchText(participant.name);
        return nameSearch.every((term) => normalizedName.includes(term));
    });
}
// Service para buscar participantes pelo CPF
export async function getParticipantByCpf(cpf) {
    if (typeof cpf !== "string") {
        throw new AppError(400, "CPF inválido.");
    }
    const normalizedCpf = cpf.replace(/\D/g, "");
    if (normalizedCpf.length !== 11) {
        throw new AppError(400, "CPF deve conter exatamente 11 dígitos.");
    }
    const participant = await prisma.participant.findUnique({
        where: { cpf: normalizedCpf },
        select: participantSelect,
    });
    return participant;
}
// Participantes que já ganharam ficam inelegíveis para todos os sorteios futuros.
export async function listEligibleParticipants() {
    return prisma.participant.findMany({
        where: {
            present: true,
            participationNumber: { not: null },
            draw: null,
        },
        select: participantSelect,
        orderBy: { participationNumber: "asc" },
    });
}
// Service para retornar os números gerais dos participantes.
export async function getParticipantStats() {
    const counts = await prisma.participant.groupBy({
        by: ["present"],
        _count: { _all: true },
    });
    const totalParticipants = counts.reduce((total, group) => total + group._count._all, 0);
    const presentParticipants = counts.find((group) => group.present)?._count._all ?? 0;
    const absentParticipants = totalParticipants - presentParticipants;
    return { totalParticipants, presentParticipants, absentParticipants };
}
