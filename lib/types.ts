export type CrawlStatus = "pending" | "running" | "completed" | "completed_with_errors" | "failed";
export type ContributorStatus = "ok" | "no_commit" | "shallow" | "unavailable";

export type Repository = { id: string; url: string; owner: string; name: string; active: boolean; createdAt: string; };
export type Settings = { timezone: string; shallowThreshold: number; alertEmail: string; notificationsEnabled: boolean; };
export type RepositoryResult = { repositoryId: string; owner: string; name: string; status: CrawlStatus; commitCount: number; errorMessage: string | null; };
export type ContributorSummary = { githubUsername: string; commitCount: number; latestCommitAt: string | null; additions: number | null; deletions: number | null; changedFiles: number | null; status: ContributorStatus; };
export type WeeklyReport = { id: string; weekStart: string; weekEnd: string; status: CrawlStatus; threshold: number; contributors: ContributorSummary[]; repositoryResults: RepositoryResult[]; errorSummary: string | null; notificationStatus: string; };
