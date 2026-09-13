import { jsonError, logError, readSettings, getReportByWeek, reportThreshold } from "@/lib/server";

export async function GET(_request: Request, context: { params: Promise<{ weekStart: string }> }) {
  try { const { weekStart } = await context.params; const report = await getReportByWeek(decodeURIComponent(weekStart)); if (!report) { const error = new Error("Weekly report not found."); logError("GET /api/reports/:weekStart report not found", error); return Response.json({ error: error.message }, { status: 404 }); } return Response.json({ report: reportThreshold(report, (await readSettings()).shallowThreshold) }); }
  catch (error) { return jsonError(error, 500, "GET /api/reports/:weekStart failed"); }
}
