import { errorMessage, getReportList, logError, readSettings, reportThreshold } from "@/lib/server";

export async function GET() {
  try { const configured = await readSettings(); const reports = (await getReportList()).filter(Boolean).map((report) => reportThreshold(report!, configured.shallowThreshold)); return Response.json({ reports }); }
  catch (error) { logError("GET /api/reports failed", error); return Response.json({ reports: [], error: errorMessage(error) }, { status: 200 }); }
}
