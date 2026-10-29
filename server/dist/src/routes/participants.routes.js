import { Router } from "express";
import { toggleParticipantPresence, listParticipantsPage, getParticipantById, getParticipantsByRegistrationNumber, getParticipantsByPublicAgency, getParticipantsByName, getParticipantByCpf, listEligibleParticipants, getParticipantStats, listRecentConfirmations, } from "../services/participants.service.js";
const router = Router();
function isPublicAgency(value) {
    return value === "PREFEITURA" || value === "CAMARA";
}
function parsePositiveInteger(value, fallback, maximum) {
    if (value === undefined) {
        return fallback;
    }
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
        return null;
    }
    const parsedValue = Number(value);
    if (!Number.isSafeInteger(parsedValue) ||
        (maximum !== undefined && parsedValue > maximum)) {
        return null;
    }
    return parsedValue;
}
/* PATCH /api/participants/:id/presence - Route to toggle the presence of a participant by ID. If the participant is not present,
it will mark them as present and assign a participation number. If they are already present, it will mark them as not present and
remove their participation number.
*/
router.patch("/:id/presence", async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            res.status(400).json({
                mensagem: "ID do participante inválido.",
            });
            return;
        }
        const participant = await toggleParticipantPresence(id);
        if (!participant) {
            res.status(404).json({
                mensagem: "Participante não encontrado.",
            });
            return;
        }
        res.status(200).json({
            mensagem: participant.present
                ? "Presença confirmada com sucesso."
                : "Presença removida com sucesso.",
            participante: participant,
        });
    }
    catch (error) {
        next(error);
    }
});
/* GET /api/participants/stats - Route to retrieve statistics about participants, such as total count, present count,
and absent count.
*/
router.get("/stats", async (_req, res, next) => {
    try {
        const stats = await getParticipantStats();
        res.status(200).json({
            mensagem: "Estatísticas dos participantes consultadas com sucesso.",
            estatisticas: stats,
        });
    }
    catch (error) {
        next(error);
    }
});
// GET /api/participants/eligible - Route to retrieve a list of eligible participants.
router.get("/eligible", async (_req, res, next) => {
    try {
        const participants = await listEligibleParticipants();
        res.status(200).json({
            mensagem: "Participantes elegíveis consultados com sucesso.",
            participantes: participants,
        });
    }
    catch (error) {
        next(error);
    }
});
// GET /api/participants/by-registration/:registrationNumber - Route to retrieve participants by their registration number.
router.get("/by-registration/:registrationNumber", async (req, res, next) => {
    try {
        const registrationNumber = req.params.registrationNumber;
        const participants = await getParticipantsByRegistrationNumber(registrationNumber);
        res.status(200).json({
            mensagem: "Consulta por matrícula concluída.",
            participantes: participants,
        });
    }
    catch (error) {
        next(error);
    }
});
// GET /api/participants/by-agency/:publicAgency - Route to retrieve participants by their public agency.
router.get("/by-agency/:publicAgency", async (req, res, next) => {
    try {
        const publicAgency = req.params.publicAgency;
        if (!isPublicAgency(publicAgency)) {
            res.status(400).json({
                mensagem: "Órgão público inválido.",
            });
            return;
        }
        const participants = await getParticipantsByPublicAgency(publicAgency);
        res.status(200).json({
            mensagem: "Consulta por órgão concluída.",
            participantes: participants,
        });
    }
    catch (error) {
        next(error);
    }
});
// GET /api/participants/by-name/:name - Route to retrieve participants by their name.
router.get("/by-name/:name", async (req, res, next) => {
    try {
        const name = req.params.name;
        const participants = await getParticipantsByName(name);
        res.status(200).json({
            mensagem: "Consulta por nome concluída.",
            participantes: participants,
        });
    }
    catch (error) {
        next(error);
    }
});
// GET /api/participants/by-cpf?cpf=12345678901 = Route to retrieve a participant by their CPF (Cadastro de Pessoas Físicas).
router.get("/by-cpf", async (req, res, next) => {
    try {
        const cpf = req.query.cpf;
        if (typeof cpf !== "string") {
            res.status(400).json({
                mensagem: "Informe um CPF válido para a consulta.",
            });
            return;
        }
        const participant = await getParticipantByCpf(cpf);
        if (!participant) {
            res.status(404).json({
                mensagem: "Participante não encontrado.",
            });
            return;
        }
        res.status(200).json({
            mensagem: "Participante encontrado com sucesso.",
            participante: participant,
        });
    }
    catch (error) {
        next(error);
    }
});
router.get("/recent", async (_req, res, next) => {
    try {
        const participants = await listRecentConfirmations();
        res.status(200).json({
            mensagem: "Presenças recentes consultadas com sucesso.",
            participantes: participants,
        });
    }
    catch (error) {
        next(error);
    }
});
/* GET /api/participants?publicAgency=PREFEITURA&present=true&search=Francisco - Route to retrieve a list of participants based on
optional filters: public agency, presence status, and search term.
*/
router.get("/", async (req, res, next) => {
    try {
        const filters = {};
        const publicAgency = req.query.publicAgency;
        const present = req.query.present;
        const search = req.query.search;
        const page = parsePositiveInteger(req.query.page, 1);
        const pageSize = parsePositiveInteger(req.query.pageSize, 20, 100);
        if (page === null) {
            res.status(400).json({
                mensagem: "O parâmetro page deve ser um inteiro positivo.",
            });
            return;
        }
        if (pageSize === null) {
            res.status(400).json({
                mensagem: "O parâmetro pageSize deve ser um inteiro entre 1 e 100.",
            });
            return;
        }
        if (publicAgency !== undefined) {
            if (!isPublicAgency(publicAgency)) {
                res.status(400).json({
                    mensagem: "Órgão público inválido.",
                });
                return;
            }
            filters.publicAgency = publicAgency;
        }
        if (present !== undefined) {
            if (typeof present !== "string" ||
                (present !== "true" && present !== "false")) {
                res.status(400).json({
                    mensagem: "O filtro present deve ser true ou false.",
                });
                return;
            }
            filters.present = present === "true";
        }
        if (search !== undefined) {
            if (typeof search !== "string") {
                res.status(400).json({
                    mensagem: "O filtro de busca deve ser um texto.",
                });
                return;
            }
            filters.search = search;
        }
        const result = await listParticipantsPage(filters, { page, pageSize });
        res.status(200).json({
            mensagem: "Consulta de participantes concluída.",
            ...result,
        });
    }
    catch (error) {
        next(error);
    }
});
/* GET /api/participants/:id  - Route to retrieve a participant by their ID. If the participant is found, it returns their details;
otherwise, it returns a 404 error.
*/
router.get("/:id", async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            res.status(400).json({
                mensagem: "ID do participante inválido.",
            });
            return;
        }
        const participant = await getParticipantById(id);
        if (!participant) {
            res.status(404).json({
                mensagem: "Participante não encontrado.",
            });
            return;
        }
        res.status(200).json({
            mensagem: "Participante encontrado com sucesso.",
            participante: participant,
        });
    }
    catch (error) {
        next(error);
    }
});
export default router;
