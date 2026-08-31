-- CreateTable
CREATE TABLE "HistoricalGEX" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "gammaFlip" REAL,
    "putWall" REAL,
    "callWall" REAL,
    "spotPrice" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "HistoricalGEX_symbol_date_idx" ON "HistoricalGEX"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalGEX_symbol_date_key" ON "HistoricalGEX"("symbol", "date");
