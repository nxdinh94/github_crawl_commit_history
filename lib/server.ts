import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  commitDetailsCache,
  contributorSummaries,
  crawlRuns,
  repositories,
  repositoryRuns,
  rosterMembers,
  settings,
} from "@/db/schema";
import { createGitHubClient } from "@/lib/github";
import { aggregateCommits, getPreviousWeekRange, normalizeUsername } from "@/lib/monitor";
import type { CrawlStatus, RepositoryResult, Settings, WeeklyReport } from "@/lib/types";

export const DEFAULT_SETTINGS: Settings = {
  timezone: "Asia/Bangkok",
  shallowThreshold: 20,
  alertEmail: "",
  notificationsEnabled: true,
};

export function logError(context: string, error: unknown, details: Record<string, unknown> = {}) {
  const loggedError = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : error;
  console.error(`[Commit Watch] ${context}`, { ...details, error: loggedError });
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "Unexpected server error";
}

export function jsonError(error: unknown, status = 500, context = "API request failed") {
  logError(context, error);
  return Response.json({ error: errorMessage(error) }, { status });
}

export async function readSettings(): Promise<Settings> {
  const [row] = await getDb().select().from(settings).where(eq(settings.id, 1)).limit(1);
  return row ? {
    timezone: row.timezone,
    shallowThreshold: row.shallowThreshold,
    alertEmail: row.alertEmail,
    notificationsEnabled: row.notificationsEnabled,
  } : DEFAULT_SETTINGS;
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
    contributors: contributorRows.map((row) => ({
      githubUsername: row.githubUsername,
      commitCount: row.commitCount,
      latestCommitAt: row.latestCommitAt,
      additions: row.additions,
      deletions: row.deletions,
      changedFiles: row.changedFiles,
      status: row.status as WeeklyReport["contributors"][number]["status"],
    })),
    repositoryResults: repositoryRows.map((row) => ({
      repositoryId: row.repositoryId,
      owner: row.owner,
      name: row.name,
      status: row.status as CrawlStatus,
      commitCount: row.commitCount,
      errorMessage: row.errorMessage,
    })),
    errorSummary: run.errorSummary,
    notificationStatus: run.notificationStatus,
  };
}

export async function getReportByWeek(weekStart: string) {
  const [run] = await getDb().select().from(crawlRuns).where(eq(crawlRuns.weekStart, weekStart)).limit(1);
  return run ? getReportByRunId(run.id) : null;
}

export async function getLatestReport() {
  const [run] = await getDb().select().from(crawlRuns).orderBy(desc(crawlRuns.weekStart)).limit(1);
  return run ? getReportByRunId(run.id) : null;
}

export async function getReportList() {
  const runs = await getDb().select().from(crawlRuns).orderBy(desc(crawlRuns.weekStart)).limit(30);
  return Promise.all(runs.map((run) => getReportByRunId(run.id)));
}

export function reportThreshold(report: WeeklyReport, threshold: number) {
  return { ...report, threshold };
}

export function integrationStatus() {
  return {
    github: true,
    githubToken: Boolean(process.env.GITHUB_TOKEN),
    email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    database: true,
  };
}

export async function sendAlertEmail(report: WeeklyReport, configured: Settings) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!configured.notificationsEnabled || !configured.alertEmail || !apiKey || !from) {
    return { status: "skipped", reason: "Email integration is not configured." };
  }
  const flagged = report.contributors.filter((item) => item.status !== "ok");
  const baseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:3000";
  const lines = flagged.map((item) => `- ${item.githubUsername}: ${item.status === "no_commit" ? "no commit" : item.status === "shallow" ? "shallow contribution" : "stats unavailable"}`).join("\n");
  const subject = `Commit Watch · ${report.weekStart.slice(0, 10)} weekly follow-up`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [configured.alertEmail],
      subject,
      text: `Weekly report ${report.weekStart.slice(0, 10)} — ${report.weekEnd.slice(0, 10)}\n\nStudents needing attention:\n${lines || "None"}\n\nOpen dashboard: ${baseUrl}`,
    }),
  });
  if (!response.ok) {
    const error = new Error(`Email provider returned ${response.status}.`);
    logError("Alert email provider rejected the request", error, { status: response.status });
    throw error;
  }
  return { status: "sent" };
}

export async function crawlWeek(weekStart: string, weekEnd: string, settingsValue: Settings) {
  const db = getDb();
  const [repoRows, rosterRows] = await Promise.all([
    db.select().from(repositories).where(eq(repositories.active, true)),
    db.select().from(rosterMembers).where(eq(rosterMembers.active, true)),
  ]);
  const runId = `weekly-${weekStart}`;
  const existing = await db.select().from(crawlRuns).where(eq(crawlRuns.id, runId)).limit(1);
  if (existing.length) {
    await db.delete(contributorSummaries).where(eq(contributorSummaries.crawlRunId, runId));
    await db.delete(repositoryRuns).where(eq(repositoryRuns.crawlRunId, runId));
    await db.delete(crawlRuns).where(eq(crawlRuns.id, runId));
  }
  await db.insert(crawlRuns).values({
    id: runId,
    weekStart,
    weekEnd,
    status: "running",
    startedAt: new Date().toISOString(),
    notificationStatus: "not_sent",
  });

  const github = createGitHubClient({
    token: process.env.GITHUB_TOKEN,
    cache: {
      async get(sha) {
        const [cached] = await db.select().from(commitDetailsCache).where(eq(commitDetailsCache.sha, sha)).limit(1);
        return cached ? {
          additions: cached.additions,
          deletions: cached.deletions,
          changedFiles: cached.changedFiles,
        } : null;
      },
      async set(sha, details) {
        const values = { ...details, fetchedAt: new Date().toISOString() };
        await db.insert(commitDetailsCache).values({ sha, ...values }).onConflictDoUpdate({
          target: commitDetailsCache.sha,
          set: values,
        });
      },
    },
  });

  const allCommits = [];
  const repositoryResults: RepositoryResult[] = [];
  const errors: string[] = [];
  for (const repo of repoRows) {
    try {
      const result = await github.collectCommits(repo.owner, repo.name, weekStart, weekEnd);
      allCommits.push(...result.commits);
      const hasErrors = result.errors.length > 0;
      const errorMessage = hasErrors ? summarizeErrors(result.errors) : null;
      const status: CrawlStatus = hasErrors ? "completed_with_errors" : "completed";
      if (errorMessage) errors.push(`${repo.owner}/${repo.name}: ${errorMessage}`);
      repositoryResults.push({ repositoryId: repo.id, owner: repo.owner, name: repo.name, status, commitCount: result.commits.length, errorMessage });
      await db.insert(repositoryRuns).values({
        id: `${runId}-${repo.id}`,
        crawlRunId: runId,
        repositoryId: repo.id,
        owner: repo.owner,
        name: repo.name,
        status,
        commitCount: result.commits.length,
        errorMessage,
      });
    } catch (error) {
      logError("Repository crawl failed", error, { owner: repo.owner, repository: repo.name });
      const message = errorMessage(error);
      errors.push(`${repo.owner}/${repo.name}: ${message}`);
      repositoryResults.push({ repositoryId: repo.id, owner: repo.owner, name: repo.name, status: "failed", commitCount: 0, errorMessage: message });
      await db.insert(repositoryRuns).values({
        id: `${runId}-${repo.id}`,
        crawlRunId: runId,
        repositoryId: repo.id,
        owner: repo.owner,
        name: repo.name,
        status: "failed",
        commitCount: 0,
        errorMessage: message,
      });
    }
  }

  const contributors = aggregateCommits(
    allCommits,
    rosterRows.map((member) => member.githubUsername),
    settingsValue.shallowThreshold,
  );
  for (const item of contributors) {
    await db.insert(contributorSummaries).values({
      id: `${runId}-${normalizeUsername(item.githubUsername)}`,
      crawlRunId: runId,
      githubUsername: item.githubUsername,
      commitCount: item.commitCount,
      latestCommitAt: item.latestCommitAt,
      additions: item.additions,
      deletions: item.deletions,
      changedFiles: item.changedFiles,
      status: item.status,
    });
  }

  const status: CrawlStatus = errors.length
    ? (repositoryResults.some((repo) => repo.commitCount > 0) || contributors.length ? "completed_with_errors" : "failed")
    : "completed";
  const snapshot: WeeklyReport = {
    id: runId,
    weekStart,
    weekEnd,
    status,
    threshold: settingsValue.shallowThreshold,
    contributors,
    repositoryResults,
    errorSummary: errors.length ? errors.join("\n") : null,
    notificationStatus: "not_sent",
  };
  let notificationStatus = "skipped";
  if (status !== "completed" || contributors.some((item) => item.status !== "ok")) {
    try {
      notificationStatus = (await sendAlertEmail(snapshot, settingsValue)).status;
    } catch (error) {
      logError("Alert email failed", error);
      notificationStatus = `failed: ${errorMessage(error)}`;
    }
  }
  await db.update(crawlRuns).set({
    status,
    completedAt: new Date().toISOString(),
    errorSummary: snapshot.errorSummary,
    notificationStatus,
  }).where(eq(crawlRuns.id, runId));
  return { ...snapshot, notificationStatus };
}

function summarizeErrors(errors: string[]) {
  const shown = errors.slice(0, 5).join("; ");
  return errors.length > 5 ? `${shown}; and ${errors.length - 5} more commit error(s)` : shown;
}

export async function runPreviousWeek() {
  const configured = await readSettings();
  const period = getPreviousWeekRange(new Date(), configured.timezone);
  return crawlWeek(period.weekStart, period.weekEnd, configured);
}
