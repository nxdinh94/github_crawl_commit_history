import { env } from "cloudflare:workers";
import { jsonError, runPreviousWeek } from "@/lib/server";

export async function POST() {
  if (!env.GITHUB_TOKEN) return Response.json({ error: "GitHub integration is not configured. Add GITHUB_TOKEN in the Site runtime environment." }, { status: 503 });
  try { const report = await runPreviousWeek(); return Response.json({ ok: true, report }, { status: 201 }); }
  catch (error) { return jsonError(error, 500); }
}
