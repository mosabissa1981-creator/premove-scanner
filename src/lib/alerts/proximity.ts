export type ProximityAlertType =
  | "GAMMA_FLIP_COLLISION"
  | "PUT_WALL_COLLISION"
  | "CALL_WALL_COLLISION";

export interface ProximityAlert {
  ticker: string;
  alertType: ProximityAlertType;
  spotPrice: number;
  level: number;
  distancePct: number;
}

const WALL_STRIKE_TOLERANCE = 0.005;

export function isWithinPctBand(
  spot: number,
  level: number,
  tolerancePct = 0.2,
): boolean {
  if (spot <= 0 || level <= 0) return false;
  const distancePct = (Math.abs(spot - level) / spot) * 100;
  return distancePct <= tolerancePct;
}

export function matchesWallStrike(spot: number, wall: number): boolean {
  if (spot <= 0 || wall <= 0) return false;
  const tolerance = Math.max(spot * WALL_STRIKE_TOLERANCE, 0.01);
  return Math.abs(spot - wall) <= tolerance;
}

export function detectStructuralProximity(input: {
  ticker: string;
  spotPrice: number | null | undefined;
  gammaFlip: number | null | undefined;
  putWall: number | null | undefined;
  callWall: number | null | undefined;
}): ProximityAlert | null {
  const spot = input.spotPrice ?? 0;
  if (spot <= 0) return null;

  if (input.gammaFlip != null && isWithinPctBand(spot, input.gammaFlip)) {
    return {
      ticker: input.ticker,
      alertType: "GAMMA_FLIP_COLLISION",
      spotPrice: spot,
      level: input.gammaFlip,
      distancePct: ((spot - input.gammaFlip) / spot) * 100,
    };
  }

  if (input.putWall != null && matchesWallStrike(spot, input.putWall)) {
    return {
      ticker: input.ticker,
      alertType: "PUT_WALL_COLLISION",
      spotPrice: spot,
      level: input.putWall,
      distancePct: ((spot - input.putWall) / spot) * 100,
    };
  }

  if (input.callWall != null && matchesWallStrike(spot, input.callWall)) {
    return {
      ticker: input.ticker,
      alertType: "CALL_WALL_COLLISION",
      spotPrice: spot,
      level: input.callWall,
      distancePct: ((spot - input.callWall) / spot) * 100,
    };
  }

  return null;
}

export function proximityAlertLabel(alertType: ProximityAlertType): string {
  switch (alertType) {
    case "GAMMA_FLIP_COLLISION":
      return "⚠️ SPOT COLLIDING WITH GAMMA FLIP";
    case "PUT_WALL_COLLISION":
      return "⚠️ SPOT AT PUT WALL";
    case "CALL_WALL_COLLISION":
      return "⚠️ SPOT AT CALL WALL";
    default:
      return "⚠️ STRUCTURAL PROXIMITY ALERT";
  }
}
