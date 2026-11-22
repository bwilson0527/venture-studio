import type { Config } from "@netlify/functions";

/**
 * Every five minutes, ask the app to send the W-9 requests and reminders
 * that are due. The work itself lives in the app (`/api/cron/w9-emails`);
 * this only knocks on its door with the shared secret.
 *
 * Scheduled functions run only on the published deploy, and may run for 30
 * seconds, which is why the app limits each run to about 20.
 */
async function sendDueEmails(): Promise<void> {
  const appUrl = (Netlify.env.get("APP_URL") ?? "").replace(/\/+$/, "");
  const secret = Netlify.env.get("CRON_SECRET") ?? "";
  if (!appUrl || !secret) {
    console.error("W-9 email run skipped: APP_URL or CRON_SECRET is not set for functions.");
    return;
  }

  try {
    const response = await fetch(`${appUrl}/api/cron/w9-emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(27_000),
    });
    const body = await response.text();
    if (!response.ok) {
      console.error(`W-9 email run failed: ${response.status} ${body.slice(0, 300)}`);
      return;
    }
    console.log(`W-9 email run: ${body.slice(0, 300)}`);
  } catch (error) {
    console.error("W-9 email run did not answer:", error instanceof Error ? error.message : "unknown error");
  }
}

export default sendDueEmails;

export const config: Config = {
  // Every five minutes, all day. Times are UTC, which does not matter here:
  // the app itself keeps each firm's emails inside its working hours.
  schedule: "*/5 * * * *",
};
