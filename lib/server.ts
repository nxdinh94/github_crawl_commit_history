import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contributorSummaries, crawlRuns, repositoryRuns, settings } from "@/db/schema";
import { classifyContribution, getPreviousWeekRange, normalizeUsername } from "@/lib/monitor";
import type { CommitAggregate } from "@/lib/monitor";
import type { ContributorStatus, CrawlStatus, RepositoryResult, Settings, WeeklyReport } from "@/lib/types";

export const DEFAULT_SETTINGS: Settings = { timezone: "Asia/Bangkok", shallowThreshold: 20, alertEmail: "", notificationsEnabled: true };

export function logError(context: string, error: unknown, details: Record<string, unknown> = {}) {
  const loggedError = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : error;
  console.error(`[Commit Watch] ${context}`, { ...details, error: loggedError });
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : typeof error === "string" ? error : "Unexpected server error"; }
export function jsonError(error: unknown, status = 500, context = "API request failed") { logError(context, error); return Response.json({ error: errorMessage(error) }, { status }); }

export async function readSettings(): Promise<Settings> {
  const db = getDb();
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return row ? { timezone: row.timezone, shallowThreshold: row.shallowThreshold, alertEmail: row.alertEmail, notificationsEnabled: row.notificationsEnabled } : DEFAULT_SETTINGS;
}

export async function getReportByRunId(runId: string): Promise<WeeklyReport | null> {
  const db = getDb();
  const [run] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, runId)).limit(1);
  if (!run) return null;
  const [repositoryRows, contributorRows] = await Promise.all([
    db.select().from(repositoryRuns).where(eq(repositoryRuns.crawlRunId, runId)),
    db.select().from(contributorSummaries).where(eq(contributorSummaries.crawlRunId, runId)),
  ]);
  return {
    id: run.id,
    weekStart: run.weekStart,
    weekEnd: run.weekEnd,
    status: run.status as CrawlStatus,
    threshold: 0,
    contributors: contributorRows.map((row) => ({ githubUsername: row.githubUsername, commitCount: row.commitCount, latestCommitAt: row.latestCommitAt, additions: row.additions, deletions: row.deletions, changedFiles: row.changedFiles, status: row.status as ContributorStatus })),
    repositoryResults: repositoryRows.map((row) => ({ repositoryId: row.repositoryId, owner: row.owner, name: row.name, status: row.status as CrawlStatus, commitCount: row.commitCount, errorMessage: row.errorMessage })),
    errorSummary: run.errorSummary,
    notificationStatus: run.notificationStatus,
  };
}

export async function getReportByWeek(weekStart: string) {
  const db = getDb();
  const [run] = await db.select().from(crawlRuns).where(eq(crawlRuns.weekStart, weekStart)).limit(1);
  return run ? getReportByRunId(run.id) : null;
}

export async function getLatestReport() {
  const db = getDb();
  const [run] = await db.select().from(crawlRuns).orderBy(desc(crawlRuns.weekStart)).limit(1);
  return run ? getReportByRunId(run.id) : null;
}

export async function getReportList() {
  const db = getDb();
  const runs = await db.select().from(crawlRuns).orderBy(desc(crawlRuns.weekStart)).limit(30);
  return Promise.all(runs.map((run) => getReportByRunId(run.id)));
}

export function reportThreshold(report: WeeklyReport, threshold: number) { return { ...report, threshold }; }

export function integrationStatus() {
  // GitHub's unauthenticated API can read public repositories. A token is
  // still useful for a higher rate limit, but it should not prevent a public
  // repository from being crawled.
  return { github: true, githubToken: Boolean(env.GITHUB_TOKEN), email: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM), database: Boolean(env.DB) };
}

export function makeEmptyAggregate(githubUsername: string): CommitAggregate { return { githubUsername, commitCount: 0, latestCommitAt: null, additions: 0, deletions: 0, changedFiles: 0, hasMissingStats: false }; }

export async function sendAlertEmail(report: WeeklyReport, configured: Settings) {
  if (!configured.notificationsEnabled || !configured.alertEmail || !env.RESEND_API_KEY || !env.EMAIL_FROM) return { status: "skipped", reason: "Email integration is not configured." };
  const flagged = report.contributors.filter((item) => item.status !== "ok");
  const baseUrl = env.APP_BASE_URL || "";
  const lines = flagged.map((item) => `- ${item.githubUsername}: ${item.status === "no_commit" ? "no commit" : item.status === "shallow" ? "shallow contribution" : "stats unavailable"}`).join("\n");
  const subject = `Commit Watch · ${report.weekStart.slice(0, 10)} weekly follow-up`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [configured.alertEmail], subject, text: `Weekly report ${report.weekStart.slice(0, 10)} — ${report.weekEnd.slice(0, 10)}\n\nStudents needing attention:\n${lines || "None"}\n\nOpen dashboard: ${baseUrl}` }) });
  if (!response.ok) {
    const error = new Error(`Email provider returned ${response.status}.`);
    logError("Alert email provider rejected the request", error, { status: response.status });
    throw error;
  }
  return { status: "sent" };
}

export async function crawlWeek(weekStart: string, weekEnd: string, settingsValue: Settings) {
  const db = getDb();
  const { repositories, rosterMembers } = await import("@/db/schema").then(async (schema) => ({ repositories: schema.repositories, rosterMembers: schema.rosterMembers }));
  const repoRows = await db.select().from(repositories).where(eq(repositories.active, true));
  const rosterRows = await db.select().from(rosterMembers).where(eq(rosterMembers.active, true));
  const runId = `weekly-${weekStart}`;
  const existing = await db.select().from(crawlRuns).where(eq(crawlRuns.id, runId)).limit(1);
  if (existing.length) {
    await db.delete(contributorSummaries).where(eq(contributorSummaries.crawlRunId, runId));
    await db.delete(repositoryRuns).where(eq(repositoryRuns.crawlRunId, runId));
    await db.delete(crawlRuns).where(eq(crawlRuns.id, runId));
  }
  await db.insert(crawlRuns).values({ id: runId, weekStart, weekEnd, status: "running", startedAt: new Date().toISOString(), notificationStatus: "not_sent" });
  const aggregates = new Map<string, ReturnType<typeof makeEmptyAggregate>>();
  for (const member of rosterRows) aggregates.set(normalizeUsername(member.githubUsername), makeEmptyAggregate(member.githubUsername));
  const repositoryResults: RepositoryResult[] = [];
  const errors: string[] = [];
  for (const repo of repoRows) {
    try {
      const commits = await getCommits(repo.owner, repo.name, weekStart, weekEnd);
      for (const commit of commits) {
        const key = normalizeUsername(commit.githubUsername);
        const current = aggregates.get(key) ?? makeEmptyAggregate(commit.githubUsername);
        current.commitCount += 1;
        current.latestCommitAt = !current.latestCommitAt || commit.date > current.latestCommitAt ? commit.date : current.latestCommitAt;
        if (commit.stats) { current.additions = (current.additions ?? 0) + commit.stats.additions; current.deletions = (current.deletions ?? 0) + commit.stats.deletions; current.changedFiles = (current.changedFiles ?? 0) + commit.stats.changedFiles; }
        else current.hasMissingStats = true;
        aggregates.set(key, current);
      }
      repositoryResults.push({ repositoryId: repo.id, owner: repo.owner, name: repo.name, status: "completed", commitCount: commits.length, errorMessage: null });
      await db.insert(repositoryRuns).values({ id: `${runId}-${repo.id}`, crawlRunId: runId, repositoryId: repo.id, owner: repo.owner, name: repo.name, status: "completed", commitCount: commits.length });
    } catch (error) {
      logError("Repository crawl failed", error, { owner: repo.owner, repository: repo.name });
      const message = errorMessage(error); errors.push(`${repo.owner}/${repo.name}: ${message}`);
      repositoryResults.push({ repositoryId: repo.id, owner: repo.owner, name: repo.name, status: "failed", commitCount: 0, errorMessage: message });
      await db.insert(repositoryRuns).values({ id: `${runId}-${repo.id}`, crawlRunId: runId, repositoryId: repo.id, owner: repo.owner, name: repo.name, status: "failed", commitCount: 0, errorMessage: message });
    }
  }
  const contributors = [...aggregates.values()].map((item) => ({ ...item, additions: item.commitCount ? item.additions : null, deletions: item.commitCount ? item.deletions : null, changedFiles: item.commitCount ? item.changedFiles : null, status: classifyContribution(item.commitCount, item.commitCount ? item.additions : null, item.commitCount ? item.deletions : null, settingsValue.shallowThreshold, item.hasMissingStats) }));
  for (const item of contributors) await db.insert(contributorSummaries).values({ id: `${runId}-${normalizeUsername(item.githubUsername)}`, crawlRunId: runId, githubUsername: item.githubUsername, commitCount: item.commitCount, latestCommitAt: item.latestCommitAt, additions: item.additions, deletions: item.deletions, changedFiles: item.changedFiles, status: item.status });
  const status: CrawlStatus = errors.length ? (contributors.length ? "completed_with_errors" : "failed") : "completed";
  const snapshot: WeeklyReport = { id: runId, weekStart, weekEnd, status, threshold: settingsValue.shallowThreshold, contributors: contributors.map(({ hasMissingStats: _missing, ...item }) => item), repositoryResults, errorSummary: errors.length ? errors.join("\n") : null, notificationStatus: "not_sent" };
  let notificationStatus = "skipped";
  if (status !== "completed" || contributors.some((item) => item.status !== "ok")) { try { notificationStatus = (await sendAlertEmail(snapshot, settingsValue)).status; } catch (error) { logError("Alert email failed", error); notificationStatus = `failed: ${errorMessage(error)}`; } }
  await db.update(crawlRuns).set({ status, completedAt: new Date().toISOString(), errorSummary: snapshot.errorSummary, notificationStatus }).where(eq(crawlRuns.id, runId));
  return { ...snapshot, notificationStatus };
}

type CommitRecord = { githubUsername: string; date: string; stats: { additions: number; deletions: number; changedFiles: number } | null };
async function getCommits(owner: string, name: string, since: string, until: string): Promise<CommitRecord[]> {
  const items: { sha: string; author?: { login?: string | null } | null; commit?: { author?: { date?: string | null; email?: string | null; name?: string | null } | null } }[] = [];
  for (let page = 1; page <= 30; page += 1) {
    const response = await githubFetch(`https://api.github.com/repos/${owner}/${name}/commits?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&per_page=100&page=${page}`);
    const batch = await response.json() as typeof items;
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return mapWithConcurrency(items, 4, async (item) => {
    const details = await githubFetch(`https://api.github.com/repos/${owner}/${name}/commits/${item.sha}`).then((response) => response.json() as Promise<{ stats?: { additions?: number; deletions?: number; total?: number } }>);
    const author = item.author?.login || item.commit?.author?.email || item.commit?.author?.name || `unknown-${item.sha.slice(0, 7)}`;
    return { githubUsername: author, date: item.commit?.author?.date || new Date().toISOString(), stats: details.stats && typeof details.stats.additions === "number" && typeof details.stats.deletions === "number" ? { additions: details.stats.additions, deletions: details.stats.deletions, changedFiles: typeof details.stats.total === "number" ? details.stats.total : 0 } : null };
  });
}
async function githubFetch(url: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "commit-watch" };
    if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    let response: Response;
    try {
      response = await fetch(url, { headers });
    } catch (error) {
      logError("GitHub network request failed", error, { url, attempt: attempt + 1 });
      throw error;
    }
    if (response.ok) return response;
    const retryAfter = response.headers.get("retry-after");
    const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
    const rateLimitReset = response.headers.get("x-ratelimit-reset");
    const error = new Error(`GitHub API returned ${response.status}.`);
    logError("GitHub API request failed", error, { url, status: response.status, attempt: attempt + 1, retryAfter, rateLimitRemaining, rateLimitReset });
    if ((response.status === 429 || response.status === 403) && retryAfter) await new Promise((resolve) => setTimeout(resolve, Math.min(Number(retryAfter) * 1000, 5000)));
    else if (response.status >= 500) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    else throw error;
  }
  const error = new Error("GitHub API retry limit reached.");
  logError("GitHub API retry limit reached", error, { url });
  throw error;
}
async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) { const output: R[] = []; let cursor = 0; async function worker() { while (cursor < items.length) { const index = cursor++; output[index] = await mapper(items[index]); } } await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker())); return output; }

export async function runPreviousWeek() { const configured = await readSettings(); const period = getPreviousWeekRange(new Date(), configured.timezone); return crawlWeek(period.weekStart, period.weekEnd, configured); }
