ALTER TABLE "participants" ADD COLUMN "confirmedAt" DATETIME;

CREATE INDEX "participants_present_confirmedAt_idx"
ON "participants"("present", "confirmedAt");
