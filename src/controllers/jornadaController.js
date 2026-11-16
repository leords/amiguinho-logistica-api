// src/controllers/jornadaController.js
import { randomUUID } from 'node:crypto';
import prisma from '../config/database.js';
import { enriquecerJornadas } from '../services/centralSyncService.js';

/**
 * Controller responsável pela gestão das jornadas dos entregadores e eventos operacionais.
 */
class JornadaController {
  /**
   * Inicia uma nova jornada de entregas para o entregador autenticado.
   * Suporta UUID v4 pré-gerado no app mobile para garantia de idempotência em ambientes offline.
   * 
   * POST /api/v1/jornadas/iniciar
   * Body: { id?: string, veiculoId?: string, dataInicio?: string }
   */
  async iniciar(req, res) {
    try {
      const usuarioId = req.usuario.id;
      const { id, veiculoId, dataInicio } = req.body;

      const jornadaId = id || randomUUID();
      const dataInicioParsed = dataInicio ? new Date(dataInicio) : new Date();

      if (isNaN(dataInicioParsed.getTime())) {
        return res.status(400).json({
          sucesso: false,
          erro: 'A dataInicio fornecida é inválida. Utilize o formato ISO 8601.',
          codigo: 'DATA_INICIO_INVALIDA'
        });
      }

      // Se o ID foi fornecido pelo cliente, verifica se já existe para garantir idempotência
      if (id) {
        const jornadaExistente = await prisma.jornadaEntrega.findUnique({
          where: { id }
        });

        if (jornadaExistente) {
          return res.status(200).json({
            sucesso: true,
            mensagem: 'Jornada já iniciada anteriormente (idempotência preservada).',
            dados: jornadaExistente
          });
        }
      }

      const novaJornada = await prisma.jornadaEntrega.create({
        data: {
          id: jornadaId,
          usuarioId,
          veiculoId: veiculoId ? String(veiculoId).trim() : null,
          dataInicio: dataInicioParsed,
          status: 'EM_ANDAMENTO',
          distanciaTotalKm: 0
        }
      });

      return res.status(201).json({
        sucesso: true,
        mensagem: 'Jornada iniciada com sucesso.',
        dados: novaJornada
      });
    } catch (error) {
      console.error('[JornadaController.iniciar] Erro ao iniciar jornada:', error);
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro interno ao iniciar a jornada de entrega.',
        detalhe: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Finaliza uma jornada de entregas, registrando o encerramento e a quilometragem total percorrida.
   * 
   * POST /api/v1/jornadas/:id/finalizar
   * Params: id (UUID da jornada)
   * Body: { dataFim?: string, distanciaTotalKm?: number }
   */
  async finalizar(req, res) {
    try {
      const { id } = req.params;
      const { dataFim, distanciaTotalKm } = req.body;

      const jornadaExistente = await prisma.jornadaEntrega.findUnique({
        where: { id }
      });

      if (!jornadaExistente) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Jornada de entrega não encontrada.',
          codigo: 'JORNADA_NAO_ENCONTRADA'
        });
      }

      // Validação de data de finalização
      const dataFimParsed = dataFim ? new Date(dataFim) : new Date();
      if (isNaN(dataFimParsed.getTime())) {
        return res.status(400).json({
          sucesso: false,
          erro: 'A dataFim fornecida é inválida. Utilize o formato ISO 8601.',
          codigo: 'DATA_FIM_INVALIDA'
        });
      }

      // Determina a distância total percorrida: prioriza valor informado > telemetria real acumulada
      let distanciaFinal = distanciaTotalKm !== undefined && distanciaTotalKm !== null && Number(distanciaTotalKm) > 0
        ? Number(distanciaTotalKm)
        : Number(jornadaExistente.distanciaTotalKm || 0);

      if (!distanciaFinal || distanciaFinal === 0) {
        const pontos = await prisma.localizacaoEntrega.findMany({
          where: { jornadaId: id },
          orderBy: { dataHora: 'asc' },
          select: { latitude: true, longitude: true, precisao: true }
        });

        if (pontos.length > 1) {
          let metrosTotal = 0;
          let ultimoAnchor = null;
          for (let i = 0; i < pontos.length; i++) {
            const loc = pontos[i];
            if (loc.precisao && Number(loc.precisao) > 40 && i !== 0 && i !== pontos.length - 1) continue;
            if (!ultimoAnchor) {
              ultimoAnchor = loc;
              continue;
            }
            const R = 6371e3;
            const dLat = ((loc.latitude - ultimoAnchor.latitude) * Math.PI) / 180;
            const dLon = ((loc.longitude - ultimoAnchor.longitude) * Math.PI) / 180;
            const a =
              Math.sin(dLat / 2) ** 2 +
              Math.cos((ultimoAnchor.latitude * Math.PI) / 180) *
                Math.cos((loc.latitude * Math.PI) / 180) *
                Math.sin(dLon / 2) ** 2;
            const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            if (d >= 10 || i === pontos.length - 1) {
              metrosTotal += d;
              ultimoAnchor = loc;
            }
          }
          distanciaFinal = Number((metrosTotal / 1000).toFixed(2));
        }
      }

      // Atualiza o status e encerra a jornada
      const jornadaAtualizada = await prisma.jornadaEntrega.update({
        where: { id },
        data: {
          status: 'FINALIZADA',
          dataFim: dataFimParsed,
          distanciaTotalKm: distanciaFinal
        }
      });

      return res.status(200).json({
        sucesso: true,
        mensagem: 'Jornada finalizada com sucesso.',
        dados: jornadaAtualizada
      });
    } catch (error) {
      console.error('[JornadaController.finalizar] Erro ao finalizar jornada:', error);
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro interno ao finalizar a jornada.',
        detalhe: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Registra um evento operacional (baixa de entrega, retorno, cliente ausente, recusa).
   * Utiliza upsert para tolerar reenvio de lotes offline sem falhas de duplicação.
   * 
   * POST /api/v1/jornadas/:id/eventos
   * Params: id (UUID da jornada)
   * Body: {
   *   id: string,
   *   pedidoId: string,
   *   tipoEvento: string,
   *   latitude: number,
   *   longitude: number,
   *   precisao?: number,
   *   velocidade?: number,
   *   dataHora: string
   * }
   */
  async registrarEvento(req, res) {
    try {
      const { id: jornadaId } = req.params;
      const {
        id,
        pedidoId,
        tipoEvento,
        latitude,
        longitude,
        precisao,
        velocidade,
        dataHora
      } = req.body;

      if (!id || !pedidoId || !tipoEvento || latitude === undefined || longitude === undefined || !dataHora) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Campos obrigatórios ausentes: id, pedidoId, tipoEvento, latitude, longitude e dataHora devem ser informados.',
          codigo: 'CAMPOS_OBRIGATORIOS_AUSENTES'
        });
      }

      const dataHoraParsed = new Date(dataHora);
      if (isNaN(dataHoraParsed.getTime())) {
        return res.status(400).json({
          sucesso: false,
          erro: 'A dataHora fornecida é inválida. Utilize o formato ISO 8601.',
          codigo: 'DATA_HORA_INVALIDA'
        });
      }

      // Valida se a jornada existe
      const jornada = await prisma.jornadaEntrega.findUnique({
        where: { id: jornadaId }
      });

      if (!jornada) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Jornada informada não existe.',
          codigo: 'JORNADA_NAO_ENCONTRADA'
        });
      }

      // Upsert: cria se não existir, ou ignora/mantém dados caso reenviado pelo app cliente
      const evento = await prisma.eventoEntrega.upsert({
        where: { id },
        update: {}, // Idempotência: não sobrescreve auditoria se já existir
        create: {
          id,
          jornadaId,
          pedidoId: String(pedidoId),
          tipoEvento: String(tipoEvento).trim().toUpperCase(),
          latitude: Number(latitude),
          longitude: Number(longitude),
          precisao: precisao !== undefined && precisao !== null ? Number(precisao) : null,
          velocidade: velocidade !== undefined && velocidade !== null ? Number(velocidade) : null,
          dataHora: dataHoraParsed
        }
      });

      return res.status(201).json({
        sucesso: true,
        mensagem: 'Evento operacional registrado com sucesso.',
        dados: evento
      });
    } catch (error) {
      console.error('[JornadaController.registrarEvento] Erro ao registrar evento:', error);
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro interno ao registrar evento de entrega.',
        detalhe: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Retorna os detalhes da jornada com a lista cronológica de coordenadas GPS e eventos.
   * Utilizado para plotagem do mapa de controle e auditoria de rota.
   * 
   * GET /api/v1/jornadas/:id/rota
   * Params: id (UUID da jornada)
   */
  async obterRota(req, res) {
    try {
      const { id } = req.params;

      const jornada = await prisma.jornadaEntrega.findUnique({
        where: { id },
        include: {
          localizacoes: {
            orderBy: {
              dataHora: 'asc'
            },
            select: {
              id: true,
              latitude: true,
              longitude: true,
              precisao: true,
              velocidade: true,
              dataHora: true
            }
          },
          eventos: {
            orderBy: {
              dataHora: 'asc'
            },
            select: {
              id: true,
              pedidoId: true,
              tipoEvento: true,
              latitude: true,
              longitude: true,
              precisao: true,
              velocidade: true,
              dataHora: true
            }
          }
        }
      });

      if (!jornada) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Jornada não encontrada.',
          codigo: 'JORNADA_NAO_ENCONTRADA'
        });
      }

      const [jornadaEnriquecida] = await enriquecerJornadas([jornada]);

      // Se a jornada estiver com distância zerada ou defasada mas houver telemetria, calcula a distância real acumulada
      let metrosTotal = 0;
      let ultimoAnchor = null;
      let velSoma = 0;
      let velQtd = 0;
      let velMax = 0;

      for (let i = 0; i < jornada.localizacoes.length; i++) {
        const loc = jornada.localizacoes[i];
        const v = Number(loc.velocidade || 0);
        if (v > velMax) velMax = v;
        if (v > 2) {
          velSoma += v;
          velQtd++;
        }

        if (loc.precisao && Number(loc.precisao) > 40 && i !== 0 && i !== jornada.localizacoes.length - 1) continue;
        if (!ultimoAnchor) {
          ultimoAnchor = loc;
          continue;
        }
        const R = 6371e3;
        const dLat = ((loc.latitude - ultimoAnchor.latitude) * Math.PI) / 180;
        const dLon = ((loc.longitude - ultimoAnchor.longitude) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((ultimoAnchor.latitude * Math.PI) / 180) *
            Math.cos((loc.latitude * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
        const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (d >= 10 || i === jornada.localizacoes.length - 1) {
          metrosTotal += d;
          ultimoAnchor = loc;
        }
      }

      const distCalculadaKm = Number((metrosTotal / 1000).toFixed(2));
      const velMediaKmH = velQtd > 0 ? Math.round(velSoma / velQtd) : 0;
      const velMaxKmH = Math.round(velMax);

      if (distCalculadaKm > Number(jornadaEnriquecida.distanciaTotalKm || 0)) {
        jornadaEnriquecida.distanciaTotalKm = distCalculadaKm;
        prisma.jornadaEntrega.update({
          where: { id },
          data: { distanciaTotalKm: distCalculadaKm }
        }).catch((err) => console.warn('[JornadaController] Falha ao persistir distanciaCalculada:', err.message));
      }

      return res.status(200).json({
        sucesso: true,
        dados: {
          ...jornadaEnriquecida,
          velocidadeMediaKmH: velMediaKmH,
          velocidadeMaximaKmH: velMaxKmH,
          totalPontos: jornada.localizacoes.length,
          totalEventos: jornada.eventos.length
        }
      });
    } catch (error) {
      console.error('[JornadaController.obterRota] Erro ao obter rota:', error);
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro interno ao consultar dados da rota.',
        detalhe: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Lista as jornadas cadastradas com suporte a filtros por data, entregador e status.
   * Otimizado para o painel web/administrativo.
   * 
   * GET /api/v1/jornadas?data=YYYY-MM-DD&usuarioId=uuid&status=EM_ANDAMENTO
   */
  async listar(req, res) {
    try {
      const { data, usuarioId, status, limite = 50, pagina = 1 } = req.query;

      const where = {};

      if (usuarioId) {
        where.usuarioId = String(usuarioId);
      }

      if (status) {
        where.status = String(status).toUpperCase();
      }

      if (data) {
        // Validação da data considerando fuso horário do Brasil (-03:00)
        const strInicio = typeof data === 'string' && data.trim().length === 10 ? `${data.trim()}T00:00:00-03:00` : data;
        const strFim = typeof data === 'string' && data.trim().length === 10 ? `${data.trim()}T23:59:59.999-03:00` : data;
        const inicioDia = new Date(strInicio);
        const fimDia = new Date(strFim);

        if (isNaN(inicioDia.getTime())) {
          return res.status(400).json({
            sucesso: false,
            erro: 'Parâmetro "data" inválido. Use o formato YYYY-MM-DD.',
            codigo: 'DATA_FILTRO_INVALIDA'
          });
        }

        where.OR = [
          { dataInicio: { gte: inicioDia, lte: fimDia } },
          { status: 'EM_ANDAMENTO' },
          { eventos: { some: { dataHora: { gte: inicioDia, lte: fimDia } } } }
        ];
      }

      const limitParsed = Math.max(1, Math.min(100, Number(limite) || 50));
      const pageParsed = Math.max(1, Number(pagina) || 1);
      const skip = (pageParsed - 1) * limitParsed;

      const [total, jornadas] = await Promise.all([
        prisma.jornadaEntrega.count({ where }),
        prisma.jornadaEntrega.findMany({
          where,
          orderBy: {
            dataInicio: 'desc'
          },
          take: limitParsed,
          skip,
          include: {
            _count: {
              select: {
                localizacoes: true,
                eventos: true
              }
            },
            eventos: {
              select: {
                pedidoId: true,
                tipoEvento: true
              }
            }
          }
        })
      ]);

      const jornadasCompletas = await enriquecerJornadas(jornadas);

      const jornadasFormatadas = jornadasCompletas.map((j) => ({
        ...j,
        totalPontos: j._count?.localizacoes || 0,
        totalEventos: j._count?.eventos || 0,
      }));

      return res.status(200).json({
        sucesso: true,
        dados: jornadasFormatadas,
        paginacao: {
          total,
          pagina: pageParsed,
          limite: limitParsed,
          totalPaginas: Math.ceil(total / limitParsed)
        }
      });
    } catch (error) {
      console.error('[JornadaController.listar] Erro ao listar jornadas:', error);
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro interno ao listar jornadas.',
        detalhe: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

export default new JornadaController();
