# 🚚 Amiguinho Mobile API — Microsserviço de Telemetria e Logística

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express.js-4.21-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-6.4-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Neon Database](https://img.shields.io/badge/Neon-PostgreSQL%20Serverless-00E599?style=for-the-badge&logo=postgresql&logoColor=black)](https://neon.tech/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg?style=for-the-badge)](LICENSE)

Microsserviço de alta vazão e tolerância a falhas para **telemetria de GPS em lote**, **rastreamento de jornadas de entrega** e **auditoria de eventos operacionais** do aplicativo dos entregadores da **Distribuidora de Bebidas Amigão**.

---

## 📑 Sumário

- [Visão Geral](#-visão-geral)
- [Arquitetura e Fluxo de Dados](#-arquitetura-e-fluxo-de-dados)
- [Funcionalidades Principais](#-funcionalidades-principais)
- [Stack Tecnológica](#-stack-tecnológica)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Começando](#-começando)
  - [Pré-requisitos](#pré-requisitos)
  - [Instalação](#instalação)
  - [Configuração de Variáveis de Ambiente](#configuração-de-variáveis-de-ambiente)
  - [Banco de Dados e Migrações](#banco-de-dados-e-migrações)
  - [Executando a Aplicação](#executando-a-aplicação)
  - [Testes de Fluxo (E2E)](#testes-de-fluxo-e2e)
- [Autenticação](#-autenticação)
- [Documentação das Rotas da API](#-documentação-das-rotas-da-api)
  - [Health Check](#1-health-check)
  - [Iniciar Jornada](#2-iniciar-jornada)
  - [Finalizar Jornada](#3-finalizar-jornada)
  - [Ingestão em Lote de Coordenadas (GPS)](#4-ingestão-em-lote-de-coordenadas-gps)
  - [Registrar Evento de Entrega](#5-registrar-evento-de-entrega)
  - [Obter Rota Completa da Jornada](#6-obter-rota-completa-da-jornada)
  - [Listar Jornadas](#7-listar-jornadas)
  - [Proxy Transparente para API Central](#8-proxy-transparente-para-api-central)
- [Política de Retenção e Expurgo](#-política-de-retenção-e-expurgo)
- [Scripts Disponíveis](#-scripts-disponíveis)
- [Licença](#-licença)

---

## 🎯 Visão Geral

O ecossistema de logística da Distribuidora Amigão opera em cenários com instabilidade de rede móvel (4G/5G). Este serviço foi desenhado com arquitetura **Offline-First Resilience**:

1. **Ingestão em Massa Idempotente:** Recebe dezenas ou centenas de coordenadas GPS acumuladas pelo SQLite local do celular sem duplicar registros ou onerar a conexão móvel.
2. **Desacoplamento Inteligente:** O microsserviço opera com validação de JWT compartilhado e enriquece os dados consultando a API Central (`node-amiguinho-central`) sob demanda com cache em memória.
3. **Escalabilidade Serverless:** Persistência em PostgreSQL Serverless (Neon) via Prisma ORM 6 com pooling de conexões otimizado.

---

## 📐 Arquitetura e Fluxo de Dados

```mermaid
flowchart TD
    subgraph Mobile["📱 App Entregador (Offline-First)"]
        GPS[Captura GPS em Segundo Plano] --> SQLite[(SQLite Local)]
        SQLite --> Sync[Sincronizador em Lote]
    end

    subgraph API["🚀 amiguinho-mobile-api (Porta 3334)"]
        Sync -- "POST /api/v1/localizacoes/lote" --> LocalizacaoCtrl[Controller de Localizações]
        Sync -- "POST /api/v1/jornadas/eventos" --> EventoCtrl[Eventos de Entrega / Baixa]
        LocalizacaoCtrl --> Prisma[Prisma ORM 6]
        EventoCtrl --> Prisma
        Proxy["Proxy Transparente (/central)"] --> CentralAPI
    end

    subgraph Central["🏢 ERP Central Amigão"]
        CentralAPI[API Principal /node-amiguinho-central]
    end

    subgraph DB["🐘 Banco de Dados Serverless"]
        Prisma --> Neon[(PostgreSQL Neon)]
    end

    subgraph Painel["💻 Painel Operacional / Monitoramento"]
        PainelWeb[Dashboard Web] -- "GET /api/v1/jornadas/:id/rota" --> API
    end
```

---

## ✨ Funcionalidades Principais

- **Gestão do Ciclo da Jornada:** Início, acompanhamento em tempo real e finalização com cálculo de distância percorrida.
- **Idempotência por UUID v4:** IDs gerados no dispositivo móvel impedem duplicações caso haja retentativas de envio após perda de sinal de internet.
- **Ingestão Otimizada de GPS:** Uso de `createMany({ skipDuplicates: true })` para gravação ultrarrápida de pacotes de telemetria.
- **Auditoria de Eventos de Entrega:** Registro do ponto exato (latitude/longitude/horário) onde o entregador deu baixa no pedido, registrou recusa ou informou cliente ausente.
- **Enriquecimento com ERP Central:** Vinculação inteligente de dados do motorista, placa do veículo, pedidos da carga e status de entrega através do `centralSyncService`.
- **Expurgo Automático Semanal:** Job cron (`node-cron`) executado semanalmente para limpar histórico de GPS antigo (> 60 dias) de jornadas já finalizadas, mantendo o banco enxuto e preservando auditorias e eventos operacionais.
- **Proxy Integrado para Túneis Externos:** Rota `/central/*` para redirecionamento transparente de chamadas do aplicativo móvel à API Central quando operando via túnel (ex: Cloudflare Tunnels ou ngrok).

---

## 🛠️ Stack Tecnológica

| Tecnologia | Finalidade |
| :--- | :--- |
| **Node.js (v18+)** | Ambiente de execução JavaScript (ES Modules nativo) |
| **Express.js (v4.21)** | Roteamento HTTP, middlewares de segurança e proxy |
| **Prisma ORM (v6.4)** | Mapeamento objeto-relacional, migrações e tipagem |
| **PostgreSQL (Neon)** | Banco relacional serverless com pooler de conexões |
| **JSON Web Token (JWT)** | Autenticação unificada com segredo compartilhado |
| **node-cron (v3.0)** | Agendamento da rotina semanal de retenção e expurgo |
| **CORS / Dotenv** | Segurança de origens cruzadas e gestão de ambiente |

---

## 📂 Estrutura do Projeto

```
amiguinho-mobile-api/
├── prisma/
│   └── schema.prisma           # Modelagem de Jornada, Localizacao e Evento
├── src/
│   ├── config/
│   │   └── database.js         # Singleton do PrismaClient e conexão
│   ├── controllers/
│   │   ├── jornadaController.js     # Gestão de jornadas, rotas e eventos
│   │   └── localizacaoController.js # Ingestão em lote de telemetria GPS
│   ├── cron/
│   │   └── expurgoCron.js      # Rotina de retenção semanal (expurgo > 60 dias)
│   ├── middlewares/
│   │   └── authMiddleware.js   # Validação de token JWT (obrigatório e opcional)
│   ├── routes/
│   │   ├── jornadaRoutes.js    # Rotas de jornadas, eventos e rotas
│   │   └── localizacaoRoutes.js# Rotas de ingestão de coordenadas
│   ├── services/
│   │   └── centralSyncService.js # Sincronização e enriquecimento com API Central
│   └── app.js                  # Configurações do Express, middlewares e proxy
├── .env.example                # Modelo de variáveis de ambiente
├── .gitignore                  # Arquivos e diretórios ignorados pelo Git
├── package.json                # Metadados e dependências do projeto
├── server.js                   # Inicialização do servidor e graceful shutdown
├── test-fluxo.js               # Bateria de testes E2E do ciclo completo
└── README.md                   # Documentação oficial do microsserviço
```

---

## 🚀 Começando

### Pré-requisitos

- **Node.js** na versão `18.x` ou superior.
- **npm** (ou yarn/pnpm).
- Instância do **PostgreSQL** (recomendado Neon Serverless ou PostgreSQL local).

### Instalação

1. Clone o repositório:
```bash
git clone https://github.com/SEU_USUARIO/amiguinho-mobile-api.git
cd amiguinho-mobile-api
```

2. Instale as dependências:
```bash
npm install
```

### Configuração de Variáveis de Ambiente

Crie o arquivo `.env` na raiz copiando o exemplo:

```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais:

```env
PORT=3334
NODE_ENV=development

# String de conexão com o PostgreSQL (exemplo Neon com SSL e connection pooler)
DATABASE_URL="postgresql://usuario:senha@ep-exemplo-pooler.us-east-2.aws.neon.tech/amiguinho_logistica?sslmode=require"

# Segredo JWT compartilhado com o ecossistema Amigão
JWT_SECRET="sua_chave_secreta_jwt_compartilhada"

# URL da API Central do ERP
API_CENTRAL_URL="http://localhost:4000"
```

### Banco de Dados e Migrações

Gere o cliente do Prisma e sincronize o schema com o banco:

```bash
# Gera o Prisma Client
npm run prisma:generate

# Cria e aplica as migrations no banco de dados
npm run prisma:migrate -- --name inicial

# (Opcional) Abrir painel web para visualizar tabelas e registros
npm run prisma:studio
```

### Executando a Aplicação

```bash
# Modo de desenvolvimento (recarregamento automático com nodemon)
npm run dev

# Modo de produção
npm start
```

O servidor estará ouvindo por padrão em `http://localhost:3334`.

### Testes de Fluxo (E2E)

O projeto inclui um script que simula todo o ciclo de vida da telemetria (health check, início de jornada, envio de lote GPS, registro de eventos, consulta de rota e finalização):

```bash
npm run test:e2e
```

---

## 🔒 Autenticação

As rotas de escrita exigem o cabeçalho HTTP padrão Bearer Token:

```http
Authorization: Bearer <seu_token_jwt>
```

- O token deve ser assinado utilizando o segredo configurado em `JWT_SECRET`.
- O payload decodificado deve conter o identificador do entregador em um dos campos: `id`, `sub` ou `usuarioId`.
- Para visualização pública de mapas ou painéis operacionais, as rotas de leitura (`GET /api/v1/jornadas` e `GET /api/v1/jornadas/:id/rota`) possuem autenticação opcional.

---

## 📡 Documentação das Rotas da API

### 1. Health Check
Verifica o status e prontidão do microsserviço.

- **Método:** `GET`
- **URL:** `/health` ou `/api/v1/health`
- **Autenticação:** Nenhuma
- **Resposta (200 OK):**
```json
{
  "status": "UP",
  "servico": "amiguinho-logistica-api",
  "versao": "1.0.0",
  "horario": "2026-11-16T17:00:00.000Z"
}
```

---

### 2. Iniciar Jornada
Inicia o turno do entregador autenticado. Suporta UUID pré-gerado no aplicativo cliente.

- **Método:** `POST`
- **URL:** `/api/v1/jornadas/iniciar`
- **Autenticação:** `Bearer Token`
- **Payload:**
```json
{
  "id": "c88f1234-5678-4321-abcd-ef0123456789",
  "veiculoId": "MOTO-HONDA-01",
  "dataInicio": "2026-11-16T08:00:00.000Z"
}
```
- **Resposta (201 Created):**
```json
{
  "sucesso": true,
  "mensagem": "Jornada iniciada com sucesso.",
  "dados": {
    "id": "c88f1234-5678-4321-abcd-ef0123456789",
    "usuarioId": "usr-entregador-99",
    "veiculoId": "MOTO-HONDA-01",
    "dataInicio": "2026-11-16T08:00:00.000Z",
    "dataFim": null,
    "status": "EM_ANDAMENTO",
    "distanciaTotalKm": 0,
    "createdAt": "2026-11-16T08:00:00.123Z",
    "updatedAt": "2026-11-16T08:00:00.123Z"
  }
}
```

---

### 3. Finalizar Jornada
Encerra a jornada, gravando o timestamp final e a quilometragem calculada.

- **Método:** `POST`
- **URL:** `/api/v1/jornadas/:id/finalizar`
- **Autenticação:** `Bearer Token`
- **Payload:**
```json
{
  "dataFim": "2026-11-16T18:00:00.000Z",
  "distanciaTotalKm": 48.7
}
```
- **Resposta (200 OK):**
```json
{
  "sucesso": true,
  "mensagem": "Jornada finalizada com sucesso.",
  "dados": {
    "id": "c88f1234-5678-4321-abcd-ef0123456789",
    "usuarioId": "usr-entregador-99",
    "status": "FINALIZADA",
    "dataFim": "2026-11-16T18:00:00.000Z",
    "distanciaTotalKm": 48.7
  }
}
```

---

### 4. Ingestão em Lote de Coordenadas (GPS)
Recebe as coordenadas coletadas em segundo plano pelo app móvel. Garante idempotência via `skipDuplicates`.

- **Método:** `POST`
- **URL:** `/api/v1/localizacoes/lote`
- **Autenticação:** `Bearer Token`
- **Payload:**
```json
{
  "jornadaId": "c88f1234-5678-4321-abcd-ef0123456789",
  "coordenadas": [
    {
      "id": "f1a2b3c4-1111-2222-3333-444455556666",
      "latitude": -23.55052,
      "longitude": -46.633308,
      "precisao": 4.5,
      "velocidade": 32.4,
      "dataHora": "2026-11-16T08:15:30.000Z"
    },
    {
      "id": "f1a2b3c4-1111-2222-3333-444455556667",
      "latitude": -23.55120,
      "longitude": -46.634100,
      "precisao": 3.8,
      "velocidade": 28.1,
      "dataHora": "2026-11-16T08:16:00.000Z"
    }
  ]
}
```
- **Resposta (201 Created):**
```json
{
  "sucesso": true,
  "jornadaId": "c88f1234-5678-4321-abcd-ef0123456789",
  "recebidos": 2,
  "processados": 2,
  "inseridos": 2,
  "duplicadosIgnorados": 0
}
```

---

### 5. Registrar Evento de Entrega
Grava um evento operacional (baixa de entrega, recusa, cliente ausente). Realiza `upsert` baseado no ID do evento.

- **Método:** `POST`
- **URL:** `/api/v1/jornadas/:id/eventos`
- **Autenticação:** `Bearer Token`
- **Payload:**
```json
{
  "id": "evt-7788-9900-aabb-ccddeeff0011",
  "pedidoId": "ped-comercial-10254",
  "tipoEvento": "BAIXA_ENTREGA",
  "latitude": -23.55210,
  "longitude": -46.63520,
  "precisao": 5.0,
  "velocidade": 0.0,
  "dataHora": "2026-11-16T08:45:00.000Z"
}
```
- **Resposta (201 Created):**
```json
{
  "sucesso": true,
  "mensagem": "Evento operacional registrado com sucesso.",
  "dados": {
    "id": "evt-7788-9900-aabb-ccddeeff0011",
    "jornadaId": "c88f1234-5678-4321-abcd-ef0123456789",
    "pedidoId": "ped-comercial-10254",
    "tipoEvento": "BAIXA_ENTREGA",
    "latitude": -23.5521,
    "longitude": -46.6352,
    "precisao": 5,
    "velocidade": 0,
    "dataHora": "2026-11-16T08:45:00.000Z",
    "criadoEm": "2026-11-16T08:45:01.500Z"
  }
}
```

---

### 6. Obter Rota Completa da Jornada
Retorna a rota cronológica com coordenadas e eventos operacionais enriquecidos com os dados da carga do ERP Central.

- **Método:** `GET`
- **URL:** `/api/v1/jornadas/:id/rota`
- **Autenticação:** Opcional
- **Resposta (200 OK):**
```json
{
  "sucesso": true,
  "dados": {
    "id": "c88f1234-5678-4321-abcd-ef0123456789",
    "usuarioId": "usr-entregador-99",
    "status": "FINALIZADA",
    "dataInicio": "2026-11-16T08:00:00.000Z",
    "dataFim": "2026-11-16T18:00:00.000Z",
    "distanciaTotalKm": 48.7,
    "motoristaNome": "Carlos Motorista",
    "totalPontos": 250,
    "totalEventos": 12,
    "totalPedidos": 12,
    "entregasRealizadas": 12,
    "percentualEntregue": 100,
    "localizacoes": [
      {
        "id": "f1a2b3c4-1111-2222-3333-444455556666",
        "latitude": -23.55052,
        "longitude": -46.633308,
        "precisao": 4.5,
        "velocidade": 32.4,
        "dataHora": "2026-11-16T08:15:30.000Z"
      }
    ],
    "eventos": [
      {
        "id": "evt-7788-9900-aabb-ccddeeff0011",
        "pedidoId": "ped-comercial-10254",
        "tipoEvento": "BAIXA_ENTREGA",
        "latitude": -23.5521,
        "longitude": -46.6352,
        "precisao": 5,
        "velocidade": 0,
        "dataHora": "2026-11-16T08:45:00.000Z"
      }
    ],
    "pedidos": [
      {
        "id": 10254,
        "status": "entregue",
        "entregue": true,
        "clienteNome": "Restaurante Central",
        "endereco": "Av. Principal, 1000 - Centro",
        "total": 450.00
      }
    ]
  }
}
```

---

### 7. Listar Jornadas
Lista jornadas com paginação, filtros e dados enriquecidos da carga.

- **Método:** `GET`
- **URL:** `/api/v1/jornadas?data=2026-11-16&status=EM_ANDAMENTO&pagina=1&limite=20`
- **Parâmetros de Consulta (Query):**
  - `data` (opcional): Data no formato `YYYY-MM-DD`.
  - `status` (opcional): `EM_ANDAMENTO` ou `FINALIZADA`.
  - `usuarioId` (opcional): ID do entregador.
  - `pagina` (opcional, padrão: `1`): Número da página.
  - `limite` (opcional, padrão: `20`): Quantidade de registros por página.
- **Resposta (200 OK):**
```json
{
  "sucesso": true,
  "dados": [
    {
      "id": "c88f1234-5678-4321-abcd-ef0123456789",
      "usuarioId": "usr-entregador-99",
      "motoristaNome": "Carlos Motorista",
      "veiculoId": "MOTO-HONDA-01",
      "dataInicio": "2026-11-16T08:00:00.000Z",
      "dataFim": null,
      "status": "EM_ANDAMENTO",
      "distanciaTotalKm": 0,
      "totalPedidos": 10,
      "entregasRealizadas": 4,
      "percentualEntregue": 40,
      "_count": {
        "localizacoes": 1420,
        "eventos": 4
      }
    }
  ],
  "paginacao": {
    "total": 1,
    "pagina": 1,
    "limite": 20,
    "totalPaginas": 1
  }
}
```

---

### 8. Proxy Transparente para API Central
Redireciona chamadas iniciadas em `/central/*` para a API Central (`API_CENTRAL_URL`).

- **Método:** `GET`, `POST`, `PUT`, `DELETE`, etc.
- **URL:** `/central/*`
- **Uso:** Permite que o app móvel se comunique com o ERP Central utilizando o mesmo domínio ou túnel do microsserviço de telemetria.

---

## 🧹 Política de Retenção e Expurgo

Para manter a alta performance e a sustentabilidade de armazenamento no banco Serverless (Neon), uma rotina em `src/cron/expurgoCron.js` é executada automaticamente:

- **Frequência:** Semanal — todo domingo às 03:00 da manhã (`0 3 * * 0`).
- **O que é expurgado:** Apenas coordenadas da tabela `LocalizacaoEntrega` com mais de **60 dias** pertencentes a jornadas com status **`FINALIZADA`**.
- **O que é preservado:** As tabelas `JornadaEntrega` e `EventoEntrega` **nunca são excluídas**, garantindo compliance fiscal, relatórios gerenciais e histórico completo de auditoria.

---

## 📜 Scripts Disponíveis

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Inicia o servidor em modo de desenvolvimento com `nodemon` |
| `npm start` | Inicia o servidor em modo de produção |
| `npm run test:e2e` | Executa o teste de ponta a ponta simulando todo o fluxo de jornada |
| `npm run prisma:generate` | Gera os artefatos do Prisma Client |
| `npm run prisma:migrate` | Executa migrações no banco de dados Neon |
| `npm run prisma:deploy` | Aplica migrações pendentes em ambiente de produção |
| `npm run prisma:studio` | Inicia interface web interativa para navegar nos dados do Prisma |

---

## 📄 Licença

Este projeto é desenvolvido para a **Distribuidora de Bebidas Amigão** e está sob licença [ISC](LICENSE).
