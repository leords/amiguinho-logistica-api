// src/app.js
import express from 'express';
import cors from 'cors';
import jornadaRoutes from './routes/jornadaRoutes.js';
import localizacaoRoutes from './routes/localizacaoRoutes.js';

const app = express();

// Middlewares essenciais de segurança e parse
app.use(cors({
  origin: '*', // Ajuste conforme políticas de CORS dos apps e painéis
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Permite payloads de até 10MB para tolerar grandes lotes de telemetria offline
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check para monitoramento, balanceador de carga e Docker
app.get('/health', (req, res) => {
  return res.status(200).json({
    status: 'UP',
    servico: 'amiguinho-logistica-api',
    horario: new Date().toISOString()
  });
});

app.get('/api/v1/health', (req, res) => {
  return res.status(200).json({
    status: 'UP',
    servico: 'amiguinho-logistica-api',
    versao: '1.0.0',
    horario: new Date().toISOString()
  });
});

// Registro dos módulos de rotas sob o prefixo /api/v1
app.use('/api/v1/jornadas', jornadaRoutes);
app.use('/api/v1/localizacoes', localizacaoRoutes);

// Proxy transparente para a API Central para acesso externo via túnel
const CENTRAL_API_URL = process.env.CENTRAL_API_URL || process.env.API_CENTRAL_URL || 'http://localhost:4000';
app.use('/central', async (req, res) => {
  try {
    const targetUrl = `${CENTRAL_API_URL}${req.url}`;
    const headers = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];

    const fetchOptions = {
      method: req.method,
      headers
    };

    if (!['GET', 'HEAD'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get('content-type') || '';
    
    res.status(response.status);
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.json(data);
    } else {
      const text = await response.text();
      return res.send(text);
    }
  } catch (err) {
    console.error('[Proxy Central] Erro ao redirecionar para Central:', err.message);
    return res.status(502).json({
      sucesso: false,
      erro: 'Falha de comunicação com a API Central via túnel',
      detalhe: err.message
    });
  }
});

// Tratamento de rotas não encontradas (404)
app.use((req, res) => {
  return res.status(404).json({
    sucesso: false,
    erro: `Rota [${req.method}] ${req.originalUrl} não encontrada.`,
    codigo: 'ROTA_NAO_ENCONTRADA'
  });
});

// Tratamento global de erros não capturados (500)
app.use((err, req, res, next) => {
  console.error('[App] Erro não tratado:', err);

  return res.status(500).json({
    sucesso: false,
    erro: 'Ocorreu um erro interno inesperado no servidor.',
    codigo: 'ERRO_INTERNO_SERVIDOR',
    detalhe: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default app;
