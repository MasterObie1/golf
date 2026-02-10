import { SignJWT, jwtVerify } from "jose";
import { getSessionSecret } from "./session-secret";

export interface ScorecardTokenPayload {
  scorecardId: number;
  teamId: number;
  leagueId: number;
  weekNumber: number;
}

/**
 * Create a signed JWT token for scorecard access.
 * 48-hour expiry — players get a link that works for two days.
 */
export async function createScorecardToken(payload: ScorecardTokenPayload): Promise<string> {
  const secret = getSessionSecret();

  return new SignJWT({
    scorecardId: payload.scorecardId,
    teamId: payload.teamId,
    leagueId: payload.leagueId,
    weekNumber: payload.weekNumber,
    type: "scorecard",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("48h")
    .setIssuer("leaguelinks")
    .setAudience("scorecard")
    .sign(secret);
}

/**
 * Verify a scorecard token and return the payload.
 * Returns null if invalid or expired.
 */
export async function verifyScorecardToken(token: string): Promise<ScorecardTokenPayload | null> {
  try {
    const secret = getSessionSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: "leaguelinks",
      audience: "scorecard",
    });

    if (payload.type !== "scorecard") return null;

    const scorecardId = payload.scorecardId;
    const teamId = payload.teamId;
    const leagueId = payload.leagueId;
    const weekNumber = payload.weekNumber;

    if (
      typeof scorecardId !== "number" ||
      typeof teamId !== "number" ||
      typeof leagueId !== "number" ||
      typeof weekNumber !== "number"
    ) {
      return null;
    }

    if (!scorecardId || !teamId || !leagueId || !weekNumber) {
      return null;
    }

    const result: ScorecardTokenPayload = { scorecardId, teamId, leagueId, weekNumber };
    return result;
  } catch {
    return null;
  }
}
