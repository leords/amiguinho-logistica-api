-- CreateTable
CREATE TABLE "jornadas_entrega" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "veiculoId" TEXT,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
    "distanciaTotalKm" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jornadas_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "localizacoes_entrega" (
    "id" TEXT NOT NULL,
    "jornadaId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "precisao" DOUBLE PRECISION,
    "velocidade" DOUBLE PRECISION,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "localizacoes_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_entrega" (
    "id" TEXT NOT NULL,
    "jornadaId" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "tipoEvento" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "precisao" DOUBLE PRECISION,
    "velocidade" DOUBLE PRECISION,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jornadas_entrega_usuarioId_idx" ON "jornadas_entrega"("usuarioId");

-- CreateIndex
CREATE INDEX "jornadas_entrega_status_idx" ON "jornadas_entrega"("status");

-- CreateIndex
CREATE INDEX "jornadas_entrega_dataInicio_idx" ON "jornadas_entrega"("dataInicio");

-- CreateIndex
CREATE INDEX "localizacoes_entrega_jornadaId_idx" ON "localizacoes_entrega"("jornadaId");

-- CreateIndex
CREATE INDEX "localizacoes_entrega_dataHora_idx" ON "localizacoes_entrega"("dataHora");

-- CreateIndex
CREATE INDEX "eventos_entrega_jornadaId_idx" ON "eventos_entrega"("jornadaId");

-- CreateIndex
CREATE INDEX "eventos_entrega_pedidoId_idx" ON "eventos_entrega"("pedidoId");

-- CreateIndex
CREATE INDEX "eventos_entrega_dataHora_idx" ON "eventos_entrega"("dataHora");

-- AddForeignKey
ALTER TABLE "localizacoes_entrega" ADD CONSTRAINT "localizacoes_entrega_jornadaId_fkey" FOREIGN KEY ("jornadaId") REFERENCES "jornadas_entrega"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_entrega" ADD CONSTRAINT "eventos_entrega_jornadaId_fkey" FOREIGN KEY ("jornadaId") REFERENCES "jornadas_entrega"("id") ON DELETE CASCADE ON UPDATE CASCADE;
