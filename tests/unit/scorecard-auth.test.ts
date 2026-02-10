import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

const TEST_SECRET = "test-secret-key-at-least-32-chars-long";

beforeEach(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

import {
  createScorecardToken,
  verifyScorecardToken,
  type ScorecardTokenPayload,
} from "@/lib/scorecard-auth";

const SAMPLE_PAYLOAD: ScorecardTokenPayload = {
  scorecardId: 10,
  teamId: 5,
  leagueId: 1,
  weekNumber: 3,
};

describe("createScorecardToken", () => {
  it("creates a valid JWT string", async () => {
    const token = await createScorecardToken(SAMPLE_PAYLOAD);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  it("encodes payload fields correctly", async () => {
    const token = await createScorecardToken(SAMPLE_PAYLOAD);
    const result = await verifyScorecardToken(token);
    expect(result).toEqual(SAMPLE_PAYLOAD);
  });

  it("sets HS256 algorithm", async () => {
    const token = await createScorecardToken(SAMPLE_PAYLOAD);
    const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    expect(header.alg).toBe("HS256");
  });
});

describe("verifyScorecardToken", () => {
  it("decodes all payload fields from a valid token", async () => {
    const token = await createScorecardToken(SAMPLE_PAYLOAD);
    const result = await verifyScorecardToken(token);
    expect(result).not.toBeNull();
    expect(result!.scorecardId).toBe(10);
    expect(result!.teamId).toBe(5);
    expect(result!.leagueId).toBe(1);
    expect(result!.weekNumber).toBe(3);
  });

  it("returns null for expired token", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    const token = await new SignJWT({
      scorecardId: 1, teamId: 1, leagueId: 1, weekNumber: 1, type: "scorecard",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 86400 * 3)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .setIssuer("leaguelinks")
      .setAudience("scorecard")
      .sign(secret);

    const result = await verifyScorecardToken(token);
    expect(result).toBeNull();
  });

  it("returns null for token signed with wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret-that-is-at-least-32chars");
    const token = await new SignJWT({
      scorecardId: 1, teamId: 1, leagueId: 1, weekNumber: 1, type: "scorecard",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("48h")
      .setIssuer("leaguelinks")
      .setAudience("scorecard")
      .sign(wrongSecret);

    const result = await verifyScorecardToken(token);
    expect(result).toBeNull();
  });

  it("returns null for wrong audience", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    const token = await new SignJWT({
      scorecardId: 1, teamId: 1, leagueId: 1, weekNumber: 1, type: "scorecard",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("48h")
      .setIssuer("leaguelinks")
      .setAudience("admin") // wrong audience
      .sign(secret);

    const result = await verifyScorecardToken(token);
    expect(result).toBeNull();
  });

  it("returns null for wrong issuer", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    const token = await new SignJWT({
      scorecardId: 1, teamId: 1, leagueId: 1, weekNumber: 1, type: "scorecard",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("48h")
      .setIssuer("wrong-issuer")
      .setAudience("scorecard")
      .sign(secret);

    const result = await verifyScorecardToken(token);
    expect(result).toBeNull();
  });

  it("returns null for wrong type field", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    const token = await new SignJWT({
      scorecardId: 1, teamId: 1, leagueId: 1, weekNumber: 1, type: "admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("48h")
      .setIssuer("leaguelinks")
      .setAudience("scorecard")
      .sign(secret);

    const result = await verifyScorecardToken(token);
    expect(result).toBeNull();
  });

  it("returns null for non-number payload fields", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    const token = await new SignJWT({
      scorecardId: "not-a-number", teamId: 1, leagueId: 1, weekNumber: 1, type: "scorecard",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("48h")
      .setIssuer("leaguelinks")
      .setAudience("scorecard")
      .sign(secret);

    const result = await verifyScorecardToken(token);
    expect(result).toBeNull();
  });

  it("returns null for zero value fields", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    const token = await new SignJWT({
      scorecardId: 0, teamId: 1, leagueId: 1, weekNumber: 1, type: "scorecard",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("48h")
      .setIssuer("leaguelinks")
      .setAudience("scorecard")
      .sign(secret);

    const result = await verifyScorecardToken(token);
    expect(result).toBeNull();
  });

  it("returns null for completely invalid token", async () => {
    const result = await verifyScorecardToken("not-a-jwt");
    expect(result).toBeNull();
  });

  it("round-trips: create then verify returns original payload", async () => {
    const payload: ScorecardTokenPayload = { scorecardId: 42, teamId: 7, leagueId: 3, weekNumber: 12 };
    const token = await createScorecardToken(payload);
    const result = await verifyScorecardToken(token);
    expect(result).toEqual(payload);
  });
});
