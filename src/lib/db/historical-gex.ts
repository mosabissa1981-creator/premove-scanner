import { getPrisma } from "@/lib/db/prisma";

export interface HistoricalGexRow {
  date: string;
  gammaFlip: number | null;
  putWall: number | null;
  callWall: number | null;
  spotPrice: number | null;
}

export interface HistoricalGexSnapshot {
  symbol: string;
  date: string;
  gammaFlip: number | null;
  putWall: number | null;
  callWall: number | null;
  spotPrice: number | null;
}

export async function upsertHistoricalGex(snapshot: HistoricalGexSnapshot): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;

  const date = snapshot.date.slice(0, 10);
  const symbol = snapshot.symbol.toUpperCase();

  await prisma.historicalGEX.upsert({
    where: { symbol_date: { symbol, date } },
    create: {
      symbol,
      date,
      gammaFlip: snapshot.gammaFlip,
      putWall: snapshot.putWall,
      callWall: snapshot.callWall,
      spotPrice: snapshot.spotPrice,
    },
    update: {
      gammaFlip: snapshot.gammaFlip,
      putWall: snapshot.putWall,
      callWall: snapshot.callWall,
      spotPrice: snapshot.spotPrice,
    },
  });
}

export async function fetchHistoricalGex(
  symbol: string,
  days = 15,
): Promise<HistoricalGexRow[]> {
  const prisma = getPrisma();
  if (!prisma) return [];

  const rows = await prisma.historicalGEX.findMany({
    where: { symbol: symbol.toUpperCase() },
    orderBy: { date: "desc" },
    take: days,
    select: {
      date: true,
      gammaFlip: true,
      putWall: true,
      callWall: true,
      spotPrice: true,
    },
  });

  return rows
    .map((row) => ({
      date: row.date,
      gammaFlip: row.gammaFlip,
      putWall: row.putWall,
      callWall: row.callWall,
      spotPrice: row.spotPrice,
    }))
    .reverse();
}
