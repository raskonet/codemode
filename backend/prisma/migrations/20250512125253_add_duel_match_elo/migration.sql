-- CreateTable
CREATE TABLE "DuelMatch" (
    "id" TEXT NOT NULL,
    "duelId" TEXT NOT NULL,
    "problemTitle" TEXT NOT NULL,
    "problemPlatform" TEXT NOT NULL,
    "playerOneId" UUID NOT NULL,
    "playerTwoId" UUID NOT NULL,
    "playerOneScore" DOUBLE PRECISION NOT NULL,
    "playerTwoScore" DOUBLE PRECISION NOT NULL,
    "playerOneOldRating" INTEGER NOT NULL,
    "playerOneNewRating" INTEGER NOT NULL,
    "playerTwoOldRating" INTEGER NOT NULL,
    "playerTwoNewRating" INTEGER NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuelMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DuelMatch_duelId_idx" ON "DuelMatch"("duelId");

-- CreateIndex
CREATE INDEX "DuelMatch_playerOneId_idx" ON "DuelMatch"("playerOneId");

-- CreateIndex
CREATE INDEX "DuelMatch_playerTwoId_idx" ON "DuelMatch"("playerTwoId");

-- CreateIndex
CREATE INDEX "DuelMatch_playedAt_idx" ON "DuelMatch"("playedAt");

-- AddForeignKey
ALTER TABLE "DuelMatch" ADD CONSTRAINT "DuelMatch_playerOneId_fkey" FOREIGN KEY ("playerOneId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelMatch" ADD CONSTRAINT "DuelMatch_playerTwoId_fkey" FOREIGN KEY ("playerTwoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
