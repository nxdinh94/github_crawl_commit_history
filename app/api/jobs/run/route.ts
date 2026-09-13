import { jsonError, runPreviousWeek } from "@/lib/server";

export async function POST() {
  try { const report = await runPreviousWeek(); return Response.json({ ok: true, report }, { status: 201 }); }
  catch (error) { return jsonError(error, 500, "POST /api/jobs/run failed"); }
}
