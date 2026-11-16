// src/routes/localizacaoRoutes.js
import { Router } from 'express';
import localizacaoController from '../controllers/localizacaoController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();

// Aplica autenticação JWT compartilhada
router.use(authMiddleware);

// Ingestão em massa de coordenadas GPS salvas offline no cliente
router.post('/lote', (req, res) => localizacaoController.receberLote(req, res));

export default router;
