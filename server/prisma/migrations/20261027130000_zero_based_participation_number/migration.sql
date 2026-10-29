-- Shift the existing one-based queue to start at zero without violating uniqueness.
UPDATE "participants"
SET "participationNumber" = -"participationNumber"
WHERE "participationNumber" IS NOT NULL;

UPDATE "participants"
SET "participationNumber" = -"participationNumber" - 1
WHERE "participationNumber" < 0;
