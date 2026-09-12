import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const repositories = sqliteTable("repositories", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({ urlUnique: uniqueIndex("idx_repositories_url").on(table.url), activeIndex: index("idx_repositories_active").on(table.active) }));

export const rosterMembers = sqliteTable("roster_members", {
  id: text("id").primaryKey(),
  githubUsername: text("github_username").notNull(),
  displayName: text("display_name"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({ usernameUnique: uniqueIndex("idx_roster_username").on(table.githubUsername), activeIndex: index("idx_roster_active").on(table.active) }));

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  timezone: text("timezone").notNull().default("Asia/Bangkok"),
  shallowThreshold: integer("shallow_threshold").notNull().default(20),
  alertEmail: text("alert_email").notNull().default(""),
  notificationsEnabled: integer("notifications_enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const crawlRuns = sqliteTable("crawl_runs", {
  id: text("id").primaryKey(),
  weekStart: text("week_start").notNull(),
  weekEnd: text("week_end").notNull(),
  status: text("status").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  errorSummary: text("error_summary"),
  notificationStatus: text("notification_status").notNull().default("not_sent"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({ weekIndex: uniqueIndex("idx_crawl_runs_week").on(table.weekStart), statusIndex: index("idx_crawl_runs_status").on(table.status) }));

export const repositoryRuns = sqliteTable("repository_runs", {
  id: text("id").primaryKey(),
  crawlRunId: text("crawl_run_id").notNull(),
  repositoryId: text("repository_id").notNull(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  commitCount: integer("commit_count").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({ runIndex: index("idx_repository_runs_crawl").on(table.crawlRunId), repoIndex: index("idx_repository_runs_repo").on(table.repositoryId) }));

export const contributorSummaries = sqliteTable("contributor_summaries", {
  id: text("id").primaryKey(),
  crawlRunId: text("crawl_run_id").notNull(),
  githubUsername: text("github_username").notNull(),
  commitCount: integer("commit_count").notNull().default(0),
  latestCommitAt: text("latest_commit_at"),
  additions: integer("additions"),
  deletions: integer("deletions"),
  changedFiles: integer("changed_files"),
  status: text("status").notNull(),
}, (table) => ({ runIndex: index("idx_contributor_summaries_crawl").on(table.crawlRunId), usernameIndex: index("idx_contributor_summaries_username").on(table.githubUsername) }));

export const commitDetailsCache = sqliteTable("commit_details_cache", {
  sha: text("sha").primaryKey(),
  additions: integer("additions"),
  deletions: integer("deletions"),
  changedFiles: integer("changed_files"),
  fetchedAt: text("fetched_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
