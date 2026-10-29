-- A participant can be drawn only once for the lifetime of the system.
-- This intentionally fails if historical duplicate winners need manual review.
CREATE UNIQUE INDEX "draws_participantId_key" ON "draws"("participantId");
