// src/services/centralSyncService.js
import jwt from 'jsonwebtoken';

let cacheCargas = {
  timestamp: 0,
  dados: []
};

/**
 * Consulta a lista de cargas ativas e recentes da API Principal (node-amiguinho-central).
 * Mantém um cache volátil de 3 segundos para otimização de performance.
 */
export async function obterCargasCentral() {
  const agora = Date.now();
  if (cacheCargas.dados.length > 0 && agora - cacheCargas.timestamp < 3000) {
    return cacheCargas.dados;
  }

  const centralUrl = process.env.API_CENTRAL_URL || process.env.CENTRAL_API_URL || 'http://localhost:4000';
  const secret = process.env.JWT_SECRET || 'chave_secreta_amiguinho';

  const token = jwt.sign(
    { id: 1, usuario: 'amiguinho-mobile-api', nivel: 'admin' },
    secret,
    { expiresIn: '1h' }
  );

  try {
    const res = await fetch(`${centralUrl}/cargas`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(3500)
    });

    if (!res.ok) {
      console.warn(`[centralSyncService] Central retornou status ${res.status}`);
      return cacheCargas.dados;
    }

    const json = await res.json();
    const lista = Array.isArray(json) ? json : json.resultado || json.cargas || [];
    cacheCargas = { timestamp: agora, dados: lista };
    return lista;
  } catch (err) {
    console.warn('[centralSyncService] Falha ao consultar cargas da central:', err.message);
    return cacheCargas.dados;
  }
}

/**
 * Normaliza strings para comparação tolerante a espaços e acentos.
 */
function normalizarTexto(txt) {
  if (!txt) return '';
  return String(txt)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Enriquece uma lista de jornadas com informações do motorista, veículo e lista de pedidos da carga do ERP.
 */
export async function enriquecerJornadas(jornadas) {
  if (!jornadas || !Array.isArray(jornadas) || jornadas.length === 0) {
    return [];
  }

  const cargas = await obterCargasCentral();

  return jornadas.map((jornada) => {
    const veiculoJornadaNorm = normalizarTexto(jornada.veiculoId);
    const eventosJornada = jornada.eventos || [];
    const pedidosIdsNosEventos = new Set(
      eventosJornada.map((e) => String(e.pedidoId || '').trim())
    );

    // 1. Tenta correspondência exata por pedidos vinculados aos eventos
    let cargaCorrespondente = cargas.find((c) => {
      const pedidosCarga = c.pedidos || [];
      return pedidosCarga.some(
        (p) =>
          pedidosIdsNosEventos.has(String(p.id)) ||
          pedidosIdsNosEventos.has(String(p.uuid || ''))
      );
    });

    // 2. Se não encontrou por eventos de pedidos, tenta pelo veículo priorizando cargas com status 'rota'
    if (!cargaCorrespondente && veiculoJornadaNorm) {
      // Prioridade 1: Carga em 'rota'
      cargaCorrespondente = cargas.find((c) => {
        if (!c.veiculo) return false;
        if (String(c.status || '').toLowerCase() !== 'rota') return false;
        const vNome = normalizarTexto(c.veiculo.nome);
        const vPlaca = normalizarTexto(c.veiculo.placa);
        const vModelo = normalizarTexto(c.veiculo.modelo);
        const vId = String(c.veiculo.id || '');

        return (
          veiculoJornadaNorm === vNome ||
          veiculoJornadaNorm === vPlaca ||
          veiculoJornadaNorm === vModelo ||
          veiculoJornadaNorm === vId ||
          veiculoJornadaNorm.includes(vNome) ||
          (vNome && vNome.includes(veiculoJornadaNorm))
        );
      });

      // Prioridade 2: Qualquer outra carga recente do veículo se não houver 'rota'
      if (!cargaCorrespondente) {
        cargaCorrespondente = cargas.find((c) => {
          if (!c.veiculo) return false;
          const vNome = normalizarTexto(c.veiculo.nome);
          const vPlaca = normalizarTexto(c.veiculo.placa);
          const vModelo = normalizarTexto(c.veiculo.modelo);
          const vId = String(c.veiculo.id || '');

          return (
            veiculoJornadaNorm === vNome ||
            veiculoJornadaNorm === vPlaca ||
            veiculoJornadaNorm === vModelo ||
            veiculoJornadaNorm === vId ||
            veiculoJornadaNorm.includes(vNome) ||
            (vNome && vNome.includes(veiculoJornadaNorm))
          );
        });
      }
    }

    if (cargaCorrespondente) {
      const pedidosCarga = cargaCorrespondente.pedidos || [];
      const totalPedidos = pedidosCarga.length;

      // Conta pedidos entregues considerando tanto o status no ERP quanto os eventos gravados na telemetria
      const pedidosFormatados = pedidosCarga.map((p) => {
        const isEntregueErp = String(p.status || '').toLowerCase() === 'entregue';
        const isEntregueTelemetria =
          pedidosIdsNosEventos.has(String(p.id)) ||
          pedidosIdsNosEventos.has(String(p.uuid || ''));
        const entregue = isEntregueErp || isEntregueTelemetria;

        const enderecoCliente = p.cliente?.endereco
          ? `${p.cliente.endereco}${p.cliente.cidade ? ' - ' + p.cliente.cidade : ''}`
          : p.cliente?.cidade || 'Endereço não informado';

        return {
          id: p.id,
          uuid: p.uuid,
          status: entregue ? 'entregue' : p.status || 'pendente',
          entregue,
          clienteNome: p.cliente?.nome || `Cliente #${p.id}`,
          endereco: enderecoCliente,
          cidade: p.cliente?.cidade || '',
          total: p.total
        };
      });

      const entregasRealizadas = pedidosFormatados.filter((p) => p.entregue).length;
      const percentualEntregue =
        totalPedidos > 0 ? Math.round((entregasRealizadas / totalPedidos) * 100) : 0;

      return {
        ...jornada,
        motoristaNome: cargaCorrespondente.motorista?.nome || 'Motorista',
        motoristaTelefone: cargaCorrespondente.motorista?.telefone || null,
        cargaId: cargaCorrespondente.id,
        cargaStatus: cargaCorrespondente.status,
        totalPedidos,
        totalEntregas: totalPedidos,
        entregasRealizadas,
        percentualEntregue,
        pedidos: pedidosFormatados
      };
    }

    // Fallback padrão se não houver carga vinculada encontrada
    const totalEventos = jornada._count?.eventos ?? (jornada.eventos ? jornada.eventos.length : 0);
    return {
      ...jornada,
      motoristaNome: jornada.usuarioNome || `Motorista #${jornada.usuarioId}`,
      totalPedidos: totalEventos,
      totalEntregas: totalEventos,
      entregasRealizadas: totalEventos,
      percentualEntregue: totalEventos > 0 ? 100 : 0,
      pedidos: []
    };
  });
}

