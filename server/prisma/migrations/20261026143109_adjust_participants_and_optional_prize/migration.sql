-- CreateTable
CREATE TABLE "participants" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "cpf" TEXT,
    "publicAgency" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "prizes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantityTotal" INTEGER NOT NULL,
    "quantityAvailable" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "draws" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "participantId" INTEGER NOT NULL,
    "prizeId" INTEGER,
    "drawnAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "draws_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "draws_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "prizes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "participants_cpf_key" ON "participants"("cpf");

-- CreateIndex
CREATE INDEX "participants_name_idx" ON "participants"("name");

-- CreateIndex
CREATE INDEX "participants_publicAgency_registrationNumber_idx" ON "participants"("publicAgency", "registrationNumber");

-- CreateIndex
CREATE INDEX "draws_participantId_drawnAt_idx" ON "draws"("participantId", "drawnAt");

-- CreateIndex
CREATE INDEX "draws_prizeId_idx" ON "draws"("prizeId");
