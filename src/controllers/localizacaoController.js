// src/controllers/localizacaoController.js
import prisma from '../config/database.js';

/**
 * Controller focado em telemetria e ingestão em massa de coordenadas GPS.
 * Otimizado para alta performance e suporte a operações offline do app cliente.
 */
class LocalizacaoController {
  /**
   * Recebe um lote de pontos de localização coletados pelo SQLite do aplicativo móvel.
   * Utiliza prisma.localizacaoEntrega.createMany com skipDuplicates: true para garantir idempotência.
   * 
   * POST /api/v1/localizacoes/lote
   * Body: {
   *   jornadaId: string,
   *   coordenadas: [
   *     {
   *       id: string,
   *       latitude: number,
   *       longitude: number,
   *       precisao?: number,
   *       velocidade?: number,
   *       dataHora: string
   *     }
   *   ]
   * }
   */
  async receberLote(req, res) {
    try {
      const { jornadaId, coordenadas } = req.body;

      if (!jornadaId) {
        return res.status(400).json({
          sucesso: false,
          erro: 'O campo jornadaId é obrigatório.',
          codigo: 'JORNADA_ID_OBRIGATORIO'
        });
      }

      if (!Array.isArray(coordenadas)) {
        return res.status(400).json({
          sucesso: false,
          erro: 'O campo coordenadas deve ser um array de localizações.',
          codigo: 'COORDENADAS_FORMATO_INVALIDO'
        });
      }

      // Se o lote estiver vazio, responde de forma idempotente sem onerar o banco
      if (coordenadas.length === 0) {
        return res.status(200).json({
          sucesso: true,
          recebidos: 0,
          inseridos: 0,
          jornadaId,
          mensagem: 'Lote vazio recebido.'
        });
      }

      // Valida se a jornada correspondente existe antes da inserção
      const jornadaExiste = await prisma.jornadaEntrega.findUnique({
        where: { id: jornadaId },
        select: { id: true }
      });

      if (!jornadaExiste) {
        return res.status(404).json({
          sucesso: false,
          erro: `Jornada ${jornadaId} não encontrada. Certifique-se de que a jornada foi sincronizada antes de enviar as coordenadas.`,
          codigo: 'JORNADA_NAO_ENCONTRADA'
        });
      }

      // Mapeia e sanitiza os dados do lote
      const registrosParaInserir = [];
      const errosValidacao = [];

      for (let i = 0; i < coordenadas.length; i++) {
        const item = coordenadas[i];

        if (!item.id || item.latitude === undefined || item.longitude === undefined || !item.dataHora) {
          errosValidacao.push(`Item no índice ${i} possui campos obrigatórios ausentes (id, latitude, longitude, dataHora).`);
          continue;
        }

        const dataHoraParsed = new Date(item.dataHora);
        if (isNaN(dataHoraParsed.getTime())) {
          errosValidacao.push(`Item no índice ${i} possui dataHora inválida: ${item.dataHora}.`);
          continue;
        }

        registrosParaInserir.push({
          id: String(item.id),
          jornadaId,
          latitude: Number(item.latitude),
          longitude: Number(item.longitude),
          precisao: item.precisao !== undefined && item.precisao !== null ? Number(item.precisao) : null,
          velocidade: item.velocidade !== undefined && item.velocidade !== null ? Number(item.velocidade) : null,
          dataHora: dataHoraParsed
        });
      }

      // Se todas as coordenadas eram inválidas
      if (registrosParaInserir.length === 0) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Nenhuma coordenada válida no lote enviado.',
          detalhes: errosValidacao
        });
      }

      // Inserção em massa via Prisma com skipDuplicates (ON CONFLICT DO NOTHING no Postgres)
      // Garante alta vazão e idempotência caso o app reconecte e repita o lote do SQLite
      const resultado = await prisma.localizacaoEntrega.createMany({
        data: registrosParaInserir,
        skipDuplicates: true
      });

      return res.status(201).json({
        sucesso: true,
        jornadaId,
        recebidos: coordenadas.length,
        processados: registrosParaInserir.length,
        inseridos: resultado.count,
        duplicadosIgnorados: registrosParaInserir.length - resultado.count,
        alertas: errosValidacao.length > 0 ? errosValidacao : undefined
      });
    } catch (error) {
      console.error('[LocalizacaoController.receberLote] Erro ao processar lote:', error);

      // Tratamento específico caso caia em erro de Foreign Key do Prisma
      if (error.code === 'P2003') {
        return res.status(404).json({
          sucesso: false,
          erro: 'A jornada referenciada não existe no banco de dados.',
          codigo: 'JORNADA_INEXISTENTE'
        });
      }

      return res.status(500).json({
        sucesso: false,
        erro: 'Erro interno ao persistir lote de telemetria.',
        detalhe: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

export default new LocalizacaoController();
