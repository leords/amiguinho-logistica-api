// server.js
import 'dotenv/config';
import app from './src/app.js';
import { iniciarCronExpurgo } from './src/cron/expurgoCron.js';
import prisma from './src/config/database.js';

const PORT = process.env.PORT || 3334;

// Inicializa o agendador de tarefas de expurgo de telemetria antiga
iniciarCronExpurgo();

// Inicializa o servidor Express
const server = app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚚 amiguinho-logistica-api iniciada com sucesso!`);
  console.log(`📡 Porta: ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health Check: http://localhost:${PORT}/health`);
  console.log(`📍 Rotas da API: http://localhost:${PORT}/api/v1`);
  console.log('====================================================');
});

// Encerramento gracioso (Graceful Shutdown)
const finalizarServidor = async (sinal) => {
  console.log(`\n[Processo] Recebido sinal ${sinal}. Finalizando servidor graciosamente...`);

  server.close(async () => {
    console.log('[Servidor] Requisições HTTP encerradas.');
    try {
      await prisma.$disconnect();
      console.log('[Prisma] Desconectado do PostgreSQL Neon.');
      process.exit(0);
    } catch (err) {
      console.error('[Prisma] Erro ao desconectar:', err);
      process.exit(1);
    }
  });

  // Força o encerramento após 10 segundos caso conexões fiquem presas
  setTimeout(() => {
    console.error('[Processo] Forçando encerramento imediato por timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGINT', () => finalizarServidor('SIGINT'));
process.on('SIGTERM', () => finalizarServidor('SIGTERM'));
