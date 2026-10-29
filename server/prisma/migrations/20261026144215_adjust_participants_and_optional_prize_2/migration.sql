/*
  Warnings:

  - A unique constraint covering the columns `[publicAgency,registrationNumber]` on the table `participants` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "participants_publicAgency_registrationNumber_idx";

-- CreateIndex
CREATE UNIQUE INDEX "participants_publicAgency_registrationNumber_key" ON "participants"("publicAgency", "registrationNumber");
