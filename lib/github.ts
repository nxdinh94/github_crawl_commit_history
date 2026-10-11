import type { CommitRecord, CommitStats } from "./monitor";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2026-03-10";
const PAGE_SIZE = "100";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 60_000;

export type CommitDetails = CommitStats;

export type CommitDetailsCache = {
  get(sha: string): Promise<CommitDetails | null>;
  set(sha: string, details: CommitDetails): Promise<void>;
};

type GitHubCommitItem = {
  sha: string;
  author?: { login?: string | null } | null;
  commit?: {
    author?: { date?: string | null; email?: string | null; name?: string | null } | null;
    committer?: { date?: string | null } | null;
  };
};

type GitHubCommitDetails = {
  stats?: { additions?: number; deletions?: number } | null;
  files?: unknown[];
};
type GitHubRepository = { private?: boolean };

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAt: number | null = null,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export function createGitHubClient(options: {
  token?: string;
  cache?: CommitDetailsCache;
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}) {
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const now = options.now ?? Date.now;

  async function request(url: URL): Promise<Response> {
    let lastError: Error = new Error("GitHub API request failed.");
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      let response: Response;
      try {
        response = await fetcher(url, {
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": "commit-watch",
            ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("GitHub network request failed.");
        if (attempt === MAX_RETRIES) throw lastError;
        await sleep(250 * (2 ** attempt));
        continue;
      }

      if (response.ok) return response;

      const body = await response.json().catch(() => null) as { message?: string } | null;
      const apiMessage = body?.message?.trim();
      const retryAfter = response.headers.get("retry-after");
      const remaining = response.headers.get("x-ratelimit-remaining");
      const reset = response.headers.get("x-ratelimit-reset");
      const rateLimited = response.status === 429 || (
        response.status === 403 && (
          Boolean(retryAfter) || remaining === "0" || /rate limit/i.test(apiMessage ?? "")
        )
      );
      const message = `GitHub API returned ${response.status}${apiMessage ? `: ${apiMessage}` : ""}.`;
      const retryAt = reset && Number.isFinite(Number(reset)) ? Number(reset) * 1000 : null;
      lastError = new GitHubApiError(message, response.status, retryAt);
      const retryable = response.status >= 500 || rateLimited;
      if (!retryable || attempt === MAX_RETRIES) throw lastError;

      let delay: number;
      if (retryAfter && Number.isFinite(Number(retryAfter))) {
        delay = Math.max(0, Number(retryAfter) * 1000);
      } else if (remaining === "0" && retryAt !== null) {
        delay = Math.max(0, retryAt - now());
      } else if (rateLimited) {
        delay = 60_000 * (2 ** attempt);
      } else {
        delay = 300 * (2 ** attempt);
      }

      if (delay > MAX_RETRY_DELAY_MS) {
        throw new GitHubApiError(
          `${message} Retry when the rate limit resets${retryAt ? ` at ${new Date(retryAt).toISOString()}` : ""}.`,
          response.status,
          retryAt,
        );
      }
      await sleep(delay);
    }
    throw lastError;
  }

  async function listCommits(owner: string, repo: string, since: string, until: string) {
    const firstPage = new URL(`${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits`);
    firstPage.searchParams.set("since", since);
    firstPage.searchParams.set("until", until);
    firstPage.searchParams.set("per_page", PAGE_SIZE);

    const commits: GitHubCommitItem[] = [];
    const seen = new Set<string>();
    let page: URL | null = firstPage;
    while (page) {
      if (seen.has(page.href)) throw new Error("GitHub returned a repeated commits pagination link.");
      seen.add(page.href);
      const response = await request(page);
      const body = await response.json() as unknown;
      if (!Array.isArray(body)) throw new Error("GitHub returned an invalid commits response.");
      commits.push(...body as GitHubCommitItem[]);
      page = getNextPage(response.headers.get("link"), page);
    }
    return commits;
  }

  async function assertPublicRepository(owner: string, repo: string) {
    const url = new URL(`${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
    const response = await request(url);
    const repository = await response.json() as GitHubRepository;
    if (repository.private !== false) {
      throw new Error(`GitHub repository ${owner}/${repo} is not public and cannot be scanned.`);
    }
  }

  async function getCommitDetails(owner: string, repo: string, sha: string): Promise<CommitDetails> {
    const cached = await options.cache?.get(sha);
    if (cached) return cached;

    const firstPage = new URL(
      `${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}`,
    );
    const seen = new Set<string>();
    let page: URL | null = firstPage;
    let additions: number | null = null;
    let deletions: number | null = null;
    let fileCount = 0;
    let filesAvailable = true;
    let first = true;

    while (page) {
      if (seen.has(page.href)) throw new Error("GitHub returned a repeated commit details pagination link.");
      seen.add(page.href);
      const response = await request(page);
      const body = await response.json() as GitHubCommitDetails;
      if (first) {
        additions = typeof body.stats?.additions === "number" ? body.stats.additions : null;
        deletions = typeof body.stats?.deletions === "number" ? body.stats.deletions : null;
        first = false;
      }
      if (Array.isArray(body.files)) fileCount += body.files.length;
      else filesAvailable = false;
      page = getNextPage(response.headers.get("link"), page);
    }

    const details = { additions, deletions, changedFiles: filesAvailable ? fileCount : null };
    await options.cache?.set(sha, details);
    return details;
  }

  async function collectCommits(owner: string, repo: string, since: string, until: string, concurrency = 4) {
    await assertPublicRepository(owner, repo);
    const items = await listCommits(owner, repo, since, until);
    const records: CommitRecord[] = new Array(items.length);
    const errors: string[] = [];
    let cursor = 0;

    async function worker() {
      while (cursor < items.length) {
        const index = cursor++;
        const item = items[index];
        const author = item.author?.login || item.commit?.author?.email || item.commit?.author?.name || `unknown-${item.sha.slice(0, 7)}`;
        const date = item.commit?.committer?.date || item.commit?.author?.date || null;
        try {
          records[index] = {
            githubUsername: author,
            date,
            stats: await getCommitDetails(owner, repo, item.sha),
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Commit details could not be read.";
          errors.push(`${item.sha.slice(0, 7)}: ${message}`);
          records[index] = { githubUsername: author, date, stats: null };
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => worker()));
    return { commits: records, errors };
  }

  return { listCommits, assertPublicRepository, getCommitDetails, collectCommits };
}

function getNextPage(linkHeader: string | null, currentPage: URL): URL | null {
  if (!linkHeader) return null;
  const next = [...linkHeader.matchAll(/<([^>]+)>\s*;\s*rel="?next"?/gi)][0]?.[1];
  if (!next) return null;
  const nextPage = new URL(next, currentPage);
  if (nextPage.origin !== API_ROOT || !nextPage.pathname.startsWith("/repos/")) {
    throw new Error("GitHub returned an invalid pagination URL.");
  }
  return nextPage;
}
