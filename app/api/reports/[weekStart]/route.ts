import { jsonError, readSettings, getReportByWeek, reportThreshold } from "@/lib/server";

export async function GET(_request: Request, context: { params: Promise<{ weekStart: string }> }) {
  try { const { weekStart } = await context.params; const report = await getReportByWeek(decodeURIComponent(weekStart)); if (!report) return Response.json({ error: "Weekly report not found." }, { status: 404 }); return Response.json({ report: reportThreshold(report, (await readSettings()).shallowThreshold) }); }
  catch (error) { return jsonError(error); }
}
