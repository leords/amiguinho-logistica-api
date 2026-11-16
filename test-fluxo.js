// test-fluxo.js
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 3334}`;
const JWT_SECRET = process.env.JWT_SECRET || 'http://localhost:4000';

const usuarioTeste = {
  id: 'entregador-' + randomUUID().substring(0, 8),
  usuario: 'Carlos Motorista Amigao',
  nivelAcesso: 'ENTREGADOR'
};

const token = jwt.sign(usuarioTeste, JWT_SECRET, { expiresIn: '2h' });

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
};

function logPass(etapa, msg) {
  console.log(`\x1b[32m✔ [${etapa}]\x1b[0m ${msg}`);
}

function logFail(etapa, msg, erro) {
  console.error(`\x1b[31m✖ [${etapa}]\x1b[0m ${msg}`, erro || '');
}

async function run() {
  console.log('='.repeat(65));
  console.log('🚀 INICIANDO TESTE DO FLUXO COMPLETO DA API (END-TO-END)');
  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log(`👤 Usuário Simulado: ${usuarioTeste.usuario} (${usuarioTeste.id})`);
  console.log('='.repeat(65));

  try {
    // 1. Health Check
    console.log('\n[1/6] Testando Health Check...');
    const resHealth = await fetch(`${BASE_URL}/api/v1/health`);
    const dataHealth = await resHealth.json();
    if (resHealth.ok && dataHealth.status === 'UP') {
      logPass('HEALTH', `API está ativa e saudável (${dataHealth.servico} v${dataHealth.versao})`);
    } else {
      throw new Error(`Falha no health check: ${JSON.stringify(dataHealth)}`);
    }

    // 2. Iniciar Jornada
    console.log('\n[2/6] Testando Inicialização de Jornada (POST /api/v1/jornadas/iniciar)...');
    const jornadaId = randomUUID();
    const resIniciar = await fetch(`${BASE_URL}/api/v1/jornadas/iniciar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: jornadaId,
        veiculoId: 'MERCEDES-ACCELO-915',
        dataInicio: new Date().toISOString()
      })
    });
    const dataIniciar = await resIniciar.json();
    if (resIniciar.ok && dataIniciar.sucesso) {
      logPass('INICIAR JORNADA', `Jornada criada com sucesso! ID: ${dataIniciar.dados.id} - Status: ${dataIniciar.dados.status}`);
    } else {
      throw new Error(`Falha ao iniciar jornada: ${JSON.stringify(dataIniciar)}`);
    }

    // 3. Enviar Lote de Telemetria GPS (POST /api/v1/localizacoes/lote)
    console.log('\n[3/6] Testando Ingestão em Lote de GPS (POST /api/v1/localizacoes/lote)...');
    const agora = Date.now();
    const coordenadas = [
      {
        id: randomUUID(),
        latitude: -23.55052,
        longitude: -46.633308,
        precisao: 4.5,
        velocidade: 22.0,
        dataHora: new Date(agora - 1000 * 60 * 15).toISOString() // 15 min atrás
      },
      {
        id: randomUUID(),
        latitude: -23.55180,
        longitude: -46.634500,
        precisao: 3.8,
        velocidade: 35.5,
        dataHora: new Date(agora - 1000 * 60 * 10).toISOString() // 10 min atrás
      },
      {
        id: randomUUID(),
        latitude: -23.55320,
        longitude: -46.636100,
        precisao: 4.0,
        velocidade: 18.0,
        dataHora: new Date(agora - 1000 * 60 * 5).toISOString() // 5 min atrás
      },
      {
        id: randomUUID(),
        latitude: -23.55450,
        longitude: -46.637500,
        precisao: 5.0,
        velocidade: 0.0,
        dataHora: new Date(agora).toISOString() // agora (parado no cliente)
      }
    ];

    const resLote = await fetch(`${BASE_URL}/api/v1/localizacoes/lote`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jornadaId,
        coordenadas
      })
    });
    const dataLote = await resLote.json();
    if (resLote.ok && dataLote.sucesso) {
      logPass('LOTE TELEMETRIA', `Lote ingerido com sucesso! ${dataLote.processados} processados, ${dataLote.inseridos} pontos GPS persistidos no Neon.`);
    } else {
      throw new Error(`Falha ao ingerir lote GPS: ${JSON.stringify(dataLote)}`);
    }

    // 4. Registrar Eventos de Entrega (POST /api/v1/jornadas/:id/eventos)
    console.log('\n[4/6] Testando Registro de Eventos de Entrega (POST /api/v1/jornadas/:id/eventos)...');
    const eventoSucesso = {
      id: randomUUID(),
      pedidoId: 'PED-' + randomUUID().substring(0, 6).toUpperCase(),
      tipoEvento: 'BAIXA_ENTREGA',
      latitude: -23.55450,
      longitude: -46.637500,
      precisao: 4.2,
      velocidade: 0.0,
      dataHora: new Date(agora - 1000 * 60 * 2).toISOString()
    };

    const resEvento = await fetch(`${BASE_URL}/api/v1/jornadas/${jornadaId}/eventos`, {
      method: 'POST',
      headers,
      body: JSON.stringify(eventoSucesso)
    });
    const dataEvento = await resEvento.json();
    if (resEvento.ok && dataEvento.sucesso) {
      logPass('REGISTRAR EVENTO', `Evento registrado: [${dataEvento.dados.tipoEvento}] para o Pedido ${dataEvento.dados.pedidoId}`);
    } else {
      throw new Error(`Falha ao registrar evento: ${JSON.stringify(dataEvento)}`);
    }

    // 5. Consultar Rota Completa (GET /api/v1/jornadas/:id/rota)
    console.log('\n[5/6] Consultando Rota e Auditoria da Jornada (GET /api/v1/jornadas/:id/rota)...');
    const resRota = await fetch(`${BASE_URL}/api/v1/jornadas/${jornadaId}/rota`, {
      headers
    });
    const dataRota = await resRota.json();
    if (resRota.ok && dataRota.sucesso) {
      const jornada = dataRota.dados;
      logPass('CONSULTA ROTA', `Rota recuperada com sucesso!`);
      console.log(`   📍 Total de Pontos GPS: ${jornada.localizacoes.length}`);
      console.log(`   📦 Total de Eventos: ${jornada.eventos.length}`);
      console.log(`   ⏱ Início: ${jornada.dataInicio} | Veículo: ${jornada.veiculoId}`);
    } else {
      throw new Error(`Falha ao consultar rota: ${JSON.stringify(dataRota)}`);
    }

    // 6. Finalizar Jornada (POST /api/v1/jornadas/:id/finalizar)
    console.log('\n[6/7] Finalizando a Jornada (POST /api/v1/jornadas/:id/finalizar)...');
    const resFinalizar = await fetch(`${BASE_URL}/api/v1/jornadas/${jornadaId}/finalizar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dataFim: new Date().toISOString(),
        distanciaTotalKm: 18.75
      })
    });
    const dataFinalizar = await resFinalizar.json();
    if (resFinalizar.ok && dataFinalizar.sucesso) {
      logPass('FINALIZAR JORNADA', `Jornada finalizada! Status: ${dataFinalizar.dados.status} - Km Total: ${dataFinalizar.dados.distanciaTotalKm} km`);
    } else {
      throw new Error(`Falha ao finalizar jornada: ${JSON.stringify(dataFinalizar)}`);
    }

    // 7. Listar Jornadas (GET /api/v1/jornadas)
    console.log('\n[7/7] Listando Jornadas Registradas (GET /api/v1/jornadas)...');
    const resListar = await fetch(`${BASE_URL}/api/v1/jornadas`, { headers });
    const dataListar = await resListar.json();
    if (resListar.ok && dataListar.sucesso) {
      logPass('LISTAR JORNADAS', `Sucesso! Total de jornadas no banco: ${dataListar.paginacao.total}`);
    } else {
      throw new Error(`Falha ao listar jornadas: ${JSON.stringify(dataListar)}`);
    }

    console.log('\n' + '='.repeat(65));
    console.log('🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
    console.log('='.repeat(65));

  } catch (err) {
    logFail('EXECUÇÃO', err.message);
    process.exit(1);
  }
}

run();
