import { Router } from "express";
import { listPrizes, getPrizeById, createPrize, addPrizeQuantity, removePrizeQuantity, deletePrize, deleteAllPrizes, } from "../services/prize.service.js";
import { AppError } from "../errors/app-error.js";
const router = Router();
router.delete("/all", async (_req, res, next) => {
    try {
        const result = await deleteAllPrizes();
        res.status(200).json({
            mensagem: "Todos os prêmios foram excluídos com sucesso.",
            ...result,
        });
    }
    catch (error) {
        next(error);
    }
});
// GET /api/prizes - List all the prizes.
router.get("/", async (_req, res, next) => {
    try {
        const prizes = await listPrizes();
        res.status(200).json({
            mensagem: "Prêmios encontrados com sucesso.",
            total: prizes.length,
            premios: prizes,
        });
    }
    catch (error) {
        next(error);
    }
});
// POST /api/prizes - Register a new prize.
router.post("/", async (req, res, next) => {
    try {
        const { name, description, quantityTotal } = req.body ?? {};
        if (typeof name !== "string" || !name.trim()) {
            throw new AppError(400, "O nome do prêmio é obrigatório.");
        }
        if (typeof quantityTotal !== "number" ||
            !Number.isSafeInteger(quantityTotal) ||
            quantityTotal <= 0) {
            throw new AppError(400, "A quantidade total deve ser um número inteiro positivo.");
        }
        if (description !== undefined && typeof description !== "string") {
            throw new AppError(400, "A descrição do prêmio deve ser um texto.");
        }
        const prize = await createPrize(name, quantityTotal, description);
        res.status(201).json({
            mensagem: "Prêmio cadastrado com sucesso.",
            premio: prize,
        });
    }
    catch (error) {
        next(error);
    }
});
// PATCH /api/prizes/:id/quantity/add - Adds units to the stock of a prize.
router.patch("/:id/quantity/add", async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const { quantityToAdd } = req.body ?? {};
        if (!Number.isSafeInteger(id) || id <= 0) {
            throw new AppError(400, "ID do prêmio inválido.");
        }
        if (typeof quantityToAdd !== "number" ||
            !Number.isSafeInteger(quantityToAdd) ||
            quantityToAdd <= 0) {
            throw new AppError(400, "A quantidade a adicionar deve ser um número inteiro positivo.");
        }
        const prize = await addPrizeQuantity(id, quantityToAdd);
        res.status(200).json({
            mensagem: "Estoque do prêmio atualizado com sucesso.",
            premio: prize,
        });
    }
    catch (error) {
        next(error);
    }
});
// PATCH /api/prizes/:id/quantity/remove - Remove available units from a prize's inventory.
router.patch("/:id/quantity/remove", async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const { quantityToRemove } = req.body ?? {};
        if (!Number.isSafeInteger(id) || id <= 0) {
            throw new AppError(400, "ID do prêmio inválido.");
        }
        if (typeof quantityToRemove !== "number" ||
            !Number.isSafeInteger(quantityToRemove) ||
            quantityToRemove <= 0) {
            throw new AppError(400, "A quantidade a remover deve ser um número inteiro positivo.");
        }
        const prize = await removePrizeQuantity(id, quantityToRemove);
        res.status(200).json({
            mensagem: "Estoque do prêmio atualizado com sucesso.",
            premio: prize,
        });
    }
    catch (error) {
        next(error);
    }
});
// GET /api/prizes/:id - Look for a specific prize.
router.get("/:id", async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            throw new AppError(400, "ID do prêmio inválido.");
        }
        const prize = await getPrizeById(id);
        if (!prize) {
            throw new AppError(404, "Prêmio não encontrado.");
        }
        res.status(200).json({
            mensagem: "Prêmio encontrado com sucesso.",
            premio: prize,
        });
    }
    catch (error) {
        next(error);
    }
});
// DELETE /api/prizes/:id - Deletes a prize that has not yet been associated with any draws.
router.delete("/:id", async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            throw new AppError(400, "ID do prêmio inválido.");
        }
        const prize = await deletePrize(id);
        res.status(200).json({
            mensagem: "Prêmio excluído com sucesso.",
            premio: prize,
        });
    }
    catch (error) {
        next(error);
    }
});
export default router;
