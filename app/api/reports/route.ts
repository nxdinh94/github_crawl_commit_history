import { errorMessage, getReportList, jsonError, readSettings, reportThreshold } from "@/lib/server";

export async function GET() {
  try { const configured = await readSettings(); const reports = (await getReportList()).filter(Boolean).map((report) => reportThreshold(report!, configured.shallowThreshold)); return Response.json({ reports }); }
  catch (error) { return Response.json({ reports: [], error: errorMessage(error) }, { status: 200 }); }
}
