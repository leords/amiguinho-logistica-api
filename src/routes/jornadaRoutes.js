// src/routes/jornadaRoutes.js
import { Router } from 'express';
import jornadaController from '../controllers/jornadaController.js';
import { authMiddleware, authOpcionalMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();

// Consultas do painel operacional (leitura aberta com autenticação opcional)
router.get('/:id/rota', authOpcionalMiddleware, (req, res) => jornadaController.obterRota(req, res));
router.get('/', authOpcionalMiddleware, (req, res) => jornadaController.listar(req, res));

// Ações de mutação do entregador (autenticação JWT obrigatória)
router.post('/iniciar', authMiddleware, (req, res) => jornadaController.iniciar(req, res));
router.post('/:id/finalizar', authMiddleware, (req, res) => jornadaController.finalizar(req, res));
router.post('/:id/eventos', authMiddleware, (req, res) => jornadaController.registrarEvento(req, res));

export default router;
