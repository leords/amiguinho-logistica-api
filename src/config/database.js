// src/config/database.js
import { PrismaClient } from '@prisma/client';

/**
 * Instância singleton do PrismaClient.
 * Em desenvolvimento, exibe logs de queries e erros para facilitar o debugging.
 * Em produção, prioriza performance exibindo apenas warnings e erros.
 */
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error']
    : ['warn', 'error']
});

// Encerramento gracioso da conexão com o banco em caso de término da aplicação
const desconectarPrisma = async () => {
  try {
    await prisma.$disconnect();
    console.log('[Prisma] Conexão com o banco de dados encerrada com sucesso.');
  } catch (error) {
    console.error('[Prisma] Erro ao desconectar do banco de dados:', error);
  }
};

process.on('beforeExit', desconectarPrisma);

export default prisma;
