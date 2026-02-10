import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL =
  process.env.FROM_EMAIL || "LeagueLinks <onboarding@resend.dev>";

interface ScorecardEmailParams {
  to: string;
  captainName: string;
  teamName: string;
  leagueName: string;
  weekNumber: number;
  scorecardUrl: string;
}

export async function sendScorecardEmail({
  to,
  captainName,
  teamName,
  leagueName,
  weekNumber,
  scorecardUrl,
}: ScorecardEmailParams): Promise<{ success: true } | { success: false; error: string }> {
  if (!resend) {
    return { success: false, error: "Email is not configured. Set RESEND_API_KEY to enable." };
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `${leagueName} — Week ${weekNumber} Scorecard`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="margin: 0 0 16px; font-size: 20px; color: #1a1a1a;">
            Week ${weekNumber} Scorecard
          </h2>
          <p style="margin: 0 0 8px; font-size: 15px; color: #333;">
            Hi ${captainName || "Captain"},
          </p>
          <p style="margin: 0 0 24px; font-size: 15px; color: #333;">
            Your scorecard for <strong>${teamName}</strong> in <strong>${leagueName}</strong> is ready.
            Click the link below to enter your scores:
          </p>
          <a href="${scorecardUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2d6a4f; color: #fff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">
            Open Scorecard
          </a>
          <p style="margin: 24px 0 0; font-size: 13px; color: #888;">
            This link expires in 48 hours. If the button doesn't work, copy this URL:<br>
            <a href="${scorecardUrl}" style="color: #2d6a4f; word-break: break-all;">${scorecardUrl}</a>
          </p>
        </div>
      `,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send email.",
    };
  }
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}
