// src/cron/expurgoCron.js
import cron from 'node-cron';
import prisma from '../config/database.js';

/**
 * Função responsável por executar a rotina de expurgo de dados antigos de telemetria.
 * 
 * Regras de Retenção:
 * 1. Apaga APENAS pontos da tabela LocalizacaoEntrega.
 * 2. Condições: dataHora anterior a 60 dias atrás E jornada vinculada com status 'FINALIZADA'.
 * 3. NUNCA apaga registros de JornadaEntrega nem EventoEntrega (auditoria e relatórios permanecem íntegros).
 */
export async function executarExpurgo() {
  const inicioExecucao = Date.now();
  const limiteRetencaoDias = 60;
  const dataCorte = new Date(Date.now() - limiteRetencaoDias * 24 * 60 * 60 * 1000);

  console.log(`[Cron Expurgo] Iniciando limpeza de telemetria anterior a ${dataCorte.toISOString()} (Jornadas FINALIZADAS)...`);

  try {
    const resultado = await prisma.localizacaoEntrega.deleteMany({
      where: {
        dataHora: {
          lt: dataCorte
        },
        jornada: {
          status: 'FINALIZADA'
        }
      }
    });

    const duracaoMs = Date.now() - inicioExecucao;
    console.log(`[Cron Expurgo] Concluído com sucesso em ${duracaoMs}ms. Pontos de GPS expurgados: ${resultado.count}`);
    return resultado;
  } catch (error) {
    console.error('[Cron Expurgo] Erro durante a rotina de expurgo de telemetria:', error);
    throw error;
  }
}

/**
 * Inicializa o agendador de tarefas periódicas.
 * Agendado para rodar todo domingo às 03:00 (horário de Brasília).
 */
export function iniciarCronExpurgo() {
  // Expressão cron: '0 3 * * 0' -> Minuto 0, Hora 3, Todo domingo
  const expressaoCron = '0 3 * * 0';

  const job = cron.schedule(
    expressaoCron,
    async () => {
      console.log('[Cron Expurgo] Disparo programado semanal iniciado.');
      try {
        await executarExpurgo();
      } catch (err) {
        console.error('[Cron Expurgo] Falha na execução semanal:', err);
      }
    },
    {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    }
  );

  console.log('[Cron Expurgo] Agendador ativado: execução configurada para domingos às 03:00 (America/Sao_Paulo).');
  return job;
}

export default {
  iniciarCronExpurgo,
  executarExpurgo
};
