-- Add a queue number for participants whose attendance is confirmed.
ALTER TABLE "participants" ADD COLUMN "participationNumber" INTEGER;

-- Preserve the existing confirmation state and assign numbers by participant ID.
UPDATE "participants" AS current
SET "participationNumber" = (
    SELECT COUNT(*)
    FROM "participants" AS confirmed
    WHERE confirmed."present" = 1
      AND confirmed."id" <= current."id"
)
WHERE current."present" = 1;

CREATE UNIQUE INDEX "participants_participationNumber_key"
ON "participants"("participationNumber");
