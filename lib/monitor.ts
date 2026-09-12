import type { ContributorStatus } from "./types";

export type ParsedRepo = { url: string; owner: string; name: string };
export type CommitAggregate = { githubUsername: string; commitCount: number; latestCommitAt: string | null; additions: number | null; deletions: number | null; changedFiles: number | null; hasMissingStats: boolean };

export function parseGitHubUrl(value: string): ParsedRepo | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const owner = parts[0].trim();
    const name = parts[1].replace(/\.git$/, "").trim();
    if (!owner || !name || owner.includes(" ") || name.includes(" ")) return null;
    return { url: `https://github.com/${owner}/${name}`, owner, name };
  } catch { return null; }
}

export function normalizeUsername(value: string) { return value.trim().replace(/^@/, "").toLowerCase(); }

export function getPreviousWeekRange(now = new Date(), timezone = "Asia/Bangkok") {
  const local = getLocalParts(now, timezone);
  const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const day = localDate.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday - 7);
  const startLocal = { year: localDate.getUTCFullYear(), month: localDate.getUTCMonth() + 1, day: localDate.getUTCDate(), hour: 0, minute: 0, second: 0 };
  localDate.setUTCDate(localDate.getUTCDate() + 6);
  const endLocal = { year: localDate.getUTCFullYear(), month: localDate.getUTCMonth() + 1, day: localDate.getUTCDate(), hour: 23, minute: 59, second: 59 };
  const start = zonedToUtc(startLocal, timezone);
  const end = zonedToUtc(endLocal, timezone);
  return { weekStart: start.toISOString(), weekEnd: end.toISOString() };
}

function getLocalParts(date: Date, timezone: string) { const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date); const get = (type: string) => Number(parts.find((part) => part.type === type)?.value); return { year: get("year"), month: get("month"), day: get("day") }; }
function zonedToUtc(value: { year: number; month: number; day: number; hour: number; minute: number; second: number }, timezone: string) { const guess = new Date(Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second)); const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(guess); const get = (type: string) => Number(parts.find((part) => part.type === type)?.value); const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")); return new Date(guess.getTime() - (asUtc - guess.getTime())); }

export function classifyContribution(commitCount: number, additions: number | null, deletions: number | null, threshold: number, hasMissingStats: boolean): ContributorStatus { if (commitCount === 0) return "no_commit"; if (hasMissingStats || additions === null || deletions === null) return "unavailable"; return additions + deletions < threshold ? "shallow" : "ok"; }
