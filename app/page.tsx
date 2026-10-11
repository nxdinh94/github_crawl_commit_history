"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Database,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  Mail,
  Menu,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  ContributorStatus,
  ContributorSummary,
  Repository,
  RepositoryResult,
  Settings,
  WeeklyReport,
} from "@/lib/types";

const Github = GitBranch;

type View = "overview" | "repositories" | "roster" | "history" | "settings";
type ApiState = {
  repositories: Repository[];
  roster: { id: string; githubUsername: string; displayName: string | null }[];
  settings: Settings;
  report: WeeklyReport | null;
  reports: WeeklyReport[];
  integrations: { github: boolean; githubToken: boolean; email: boolean; database: boolean };
};
type ApiRequest = <T = unknown>(path: string, options?: RequestInit) => Promise<T>;

const emptyState: ApiState = {
  repositories: [],
  roster: [],
  settings: { timezone: "Asia/Bangkok", shallowThreshold: 20, alertEmail: "", notificationsEnabled: true },
  report: null,
  reports: [],
  integrations: { github: true, githubToken: false, email: false, database: false },
};

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "repositories", label: "Repositories", icon: Code2 },
  { id: "roster", label: "Class roster", icon: Users },
  { id: "history", label: "Report history", icon: Clock3 },
  { id: "settings", label: "Settings", icon: Settings2 },
];
const statusCopy: Record<ContributorStatus, string> = { ok: "On track", no_commit: "No commit", shallow: "Shallow contribution", unavailable: "Stats unavailable" };

function formatDate(value: string | null) { if (!value) return "—"; return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
function formatNumber(value: number | null | undefined) { return value === null || value === undefined ? "—" : new Intl.NumberFormat("en-US").format(value); }
function statusClass(status: ContributorStatus) { return status === "ok" ? "status-ok" : status === "shallow" ? "status-warn" : status === "no_commit" ? "status-alert" : "status-muted"; }
function StatusBadge({ status }: { status: ContributorStatus }) { return <Badge variant="outline" className={`status-badge ${statusClass(status)}`}><span className="status-dot" aria-hidden="true" />{statusCopy[status]}</Badge>; }
function logClientError(context: string, error: unknown, details: Record<string, unknown> = {}) {
  const loggedError = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : error;
  console.error(`[Commit Watch] ${context}`, { ...details, error: loggedError });
}
function getErrorMessage(error: unknown) { return error instanceof Error ? error.message : "Something went wrong."; }

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [data, setData] = useState<ApiState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => logClientError("Unhandled browser error", event.error ?? event.message);
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => logClientError("Unhandled promise rejection", event.reason);
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  const api = useCallback(async <T,>(path: string, options?: RequestInit): Promise<T> => {
    let status: number | undefined;
    try {
      const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
      status = response.status;
      const payload = await response.json().catch((error) => { logClientError("Failed to parse API response", error, { path, status }); return null; }) as unknown;
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Request failed.";
        throw new Error(message);
      }
      return payload as T;
    } catch (error) {
      logClientError("API request failed", error, { path, method: options?.method ?? "GET", status });
      throw error;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [repositoryResult, rosterResult, settingsResult, currentResult, reportResult] = await Promise.all([
        api<{ repositories: Repository[] }>("/api/repositories"),
        api<{ roster: ApiState["roster"] }>("/api/roster"),
        api<{ settings: Settings; integrations: ApiState["integrations"] }>("/api/settings"),
        api<{ report: WeeklyReport | null }>("/api/reports/current"),
        api<{ reports: WeeklyReport[] }>("/api/reports"),
      ]);
      setData({ repositories: repositoryResult.repositories ?? [], roster: rosterResult.roster ?? [], settings: settingsResult.settings ?? emptyState.settings, report: currentResult.report ?? null, reports: reportResult.reports ?? [], integrations: settingsResult.integrations ?? emptyState.integrations });
    } catch (error) { logClientError("Dashboard refresh failed", error); setNotice({ type: "error", text: getErrorMessage(error) }); }
    finally { setLoading(false); }
  }, [api]);

  // Load the dashboard's persisted local data once the client mounts.
  useEffect(() => { void refresh(); }, [refresh]); // eslint-disable-line react-hooks/set-state-in-effect

  const runCrawl = async () => { setActionLoading(true); setNotice(null); try { await api("/api/jobs/run", { method: "POST", body: JSON.stringify({}) }); await refresh(); setNotice({ type: "success", text: "Weekly crawl completed. The latest snapshot is ready." }); } catch (error) { logClientError("Weekly crawl failed", error); setNotice({ type: "error", text: getErrorMessage(error) }); } finally { setActionLoading(false); } };
  const report = data.report;
  const contributors = report?.contributors ?? [];
  const attentionCount = contributors.filter((item) => item.status !== "ok").length;
  const activeCount = contributors.filter((item) => item.commitCount > 0 && item.status !== "unavailable").length;
  const reportPeriod = report ? `${formatDate(report.weekStart)} — ${formatDate(report.weekEnd)}` : "No report yet";
  const goTo = (nextView: View) => { setView(nextView); setMobileNavOpen(false); };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
      <div className="brand-lockup"><div className="brand-mark"><span>cw</span></div><div><p className="brand-name">Commit Watch</p><p className="brand-caption">Class activity monitor</p></div></div>
      <div className="sidebar-rule" /><p className="eyebrow sidebar-label">Workspace</p>
      <nav aria-label="Main navigation" className="nav-list">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={`nav-item ${view === item.id ? "nav-item-active" : ""}`} onClick={() => goTo(item.id)}><Icon size={16} strokeWidth={1.8} /><span>{item.label}</span>{item.id === "overview" && attentionCount > 0 ? <span className="nav-count">{attentionCount}</span> : null}</button>; })}</nav>
      <div className="sidebar-footer"><div className="connection-summary"><span className={`connection-dot ${data.integrations.database ? "is-live" : ""}`} /><div><span className="connection-title">Data connection</span><span className="connection-meta">{data.integrations.database ? "SQLite connected" : "Needs setup"}</span></div></div><p className="sidebar-version">v0.1 · local workspace</p></div>
    </aside>
    {mobileNavOpen ? <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} /> : null}
    <main className="main-content">
      <header className="topbar"><div className="topbar-left"><Button variant="ghost" size="icon" className="mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={18} /></Button><div className="breadcrumb"><span>Classroom</span><ChevronRight size={14} /><strong>{navItems.find((item) => item.id === view)?.label}</strong></div></div><div className="topbar-actions"><span className="timezone"><span className="live-pip" /> Asia/Bangkok</span><Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh</Button><Button size="sm" onClick={() => void runCrawl()} disabled={actionLoading || !data.integrations.github}><Play size={14} /> Run now</Button></div></header>
      <div className="content-wrap">
        {notice ? <div className={`notice ${notice.type === "error" ? "notice-error" : "notice-success"}`} role="status">{notice.type === "error" ? <AlertTriangle size={16} /> : <Check size={16} />}<span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Dismiss notification"><X size={15} /></button></div> : null}
        {view === "overview" ? <OverviewView data={data} loading={loading} report={report} reportPeriod={reportPeriod} activeCount={activeCount} attentionCount={attentionCount} onNavigate={goTo} onRunCrawl={runCrawl} crawlLoading={actionLoading} /> : null}
        {view === "repositories" ? <RepositoriesView data={data} api={api} refresh={refresh} setNotice={setNotice} onRunCrawl={runCrawl} crawlLoading={actionLoading} /> : null}
        {view === "roster" ? <RosterView data={data} api={api} refresh={refresh} setNotice={setNotice} /> : null}
        {view === "history" ? <HistoryView data={data} api={api} setNotice={setNotice} /> : null}
        {view === "settings" ? <SettingsView data={data} api={api} refresh={refresh} setNotice={setNotice} /> : null}
      </div>
    </main>
  </div>;
}

function PageHeader({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: React.ReactNode }) { return <div className="page-header"><div><p className="eyebrow">{kicker}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action ? <div className="page-header-action">{action}</div> : null}</div>; }
function OverviewView({ data, loading, report, reportPeriod, activeCount, attentionCount, onNavigate, onRunCrawl, crawlLoading }: { data: ApiState; loading: boolean; report: WeeklyReport | null; reportPeriod: string; activeCount: number; attentionCount: number; onNavigate: (view: View) => void; onRunCrawl: () => Promise<void>; crawlLoading: boolean }) {
  const contributors = report?.contributors ?? [];
  const repositoriesWithIssues = report?.repositoryResults.filter((item) => item.status !== "completed") ?? [];
  return <><PageHeader kicker="Weekly pulse" title="Keep the class moving." description="A quiet view of who shipped work this week — and where to follow up." action={<span className="period-chip"><Clock3 size={14} /> {reportPeriod}</span>} />
    <div className="metric-grid"><MetricCard label="Monitored repos" value={formatNumber(data.repositories.length)} detail={data.repositories.length ? "Across the workspace" : "Add repositories to begin"} icon={<Code2 size={17} />} /><MetricCard label="Roster members" value={formatNumber(data.roster.length)} detail={data.roster.length ? "GitHub usernames" : "Import your class list"} icon={<Users size={17} />} /><MetricCard label="Active this week" value={formatNumber(activeCount)} detail={report ? `${contributors.filter((item) => item.commitCount > 0).length} with a commit` : "Waiting for first report"} icon={<ListChecks size={17} />} accent="cyan" /><MetricCard label="Needs attention" value={formatNumber(attentionCount)} detail={attentionCount ? "Follow-up recommended" : report ? "All clear for this week" : "Nothing flagged yet"} icon={<AlertTriangle size={17} />} accent={attentionCount ? "amber" : "muted"} /></div>
    <div className="section-grid"><section className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">Contributor pulse</p><h2>Who shipped this report window?</h2></div><span className="panel-meta">{report ? `Threshold ${report.threshold} lines` : "No snapshot"}</span></div>{loading ? <LoadingRows /> : contributors.length ? <ContributorTable contributors={contributors} /> : report ? <NoActivityState report={report} /> : <EmptyReportState hasRepositories={data.repositories.length > 0} onNavigate={onNavigate} onRunCrawl={onRunCrawl} crawlLoading={crawlLoading} />}</section><section className="panel repo-panel"><div className="panel-heading"><div><p className="eyebrow">Repository health</p><h2>Crawl status</h2></div><button className="text-button" onClick={() => onNavigate("repositories")}>Manage <ArrowUpRight size={13} /></button></div>{repositoriesWithIssues.length ? <div className="issue-stack">{repositoriesWithIssues.map((item) => <RepositoryIssue key={item.repositoryId} item={item} />)}</div> : data.repositories.length ? <div className="healthy-state"><div className="healthy-icon"><ShieldCheck size={21} /></div><strong>{report ? "All monitored repos completed" : "Ready for the first crawl"}</strong><span>{report ? "No repository errors in this report." : "Your repository list will appear here after setup."}</span></div> : <EmptyMini icon={<Code2 size={20} />} title="No repositories yet" detail="Add public GitHub URLs to create a monitoring scope." onClick={() => onNavigate("repositories")} />}<div className="panel-footer-line"><span>Weekly window</span><strong>Mon — Sun</strong></div></section></div>
    <div className="lower-grid"><section className="panel how-panel"><div className="panel-heading"><div><p className="eyebrow">Monitor logic</p><h2>What gets flagged?</h2></div><CircleHelp size={16} className="muted-icon" /></div><div className="logic-list"><LogicRow num="01" title="No commit" detail="A roster member has no commit across any monitored repository." tone="red" /><LogicRow num="02" title="Shallow contribution" detail="Additions + deletions are below your configured line threshold." tone="amber" /><LogicRow num="03" title="Unavailable stats" detail="GitHub returned a commit without diff statistics to evaluate." tone="gray" /></div></section><section className="panel next-panel"><div className="panel-heading"><div><p className="eyebrow">Scan cadence</p><h2>Run on demand</h2></div><span className="calendar-badge">LOCAL</span></div><div className="next-date"><strong>Manual</strong><span>Run crawl when ready</span></div><p className="next-copy">Reports cover the previous Monday–Sunday window. Start a scan from the top bar whenever you want an updated report.</p><button className="inline-link" onClick={() => onNavigate("settings")}>Review integrations <ArrowUpRight size={14} /></button></section></div>
  </>;
}
function MetricCard({ label, value, detail, icon, accent = "default" }: { label: string; value: string; detail: string; icon: React.ReactNode; accent?: string }) { return <div className={`metric-card metric-${accent}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong>{value}</strong><small>{detail}</small></div>; }
function ContributorTable({ contributors }: { contributors: ContributorSummary[] }) { return <div className="table-scroll"><table className="data-table"><thead><tr><th>Contributor</th><th>Status</th><th>Commits</th><th>Files changed</th><th>Latest commit</th><th>Diff</th></tr></thead><tbody>{contributors.map((contributor) => <tr key={contributor.githubUsername}><td><div className="person-cell"><span className="avatar">{contributor.githubUsername.slice(0, 2).toUpperCase()}</span><div><strong>{contributor.githubUsername}</strong><a href={`https://github.com/${contributor.githubUsername}`} target="_blank" rel="noreferrer">View profile <ArrowUpRight size={11} /></a></div></div></td><td><StatusBadge status={contributor.status} /></td><td className="mono-cell">{formatNumber(contributor.commitCount)}</td><td className="mono-cell">{formatNumber(contributor.changedFiles)}</td><td className="date-cell">{formatDate(contributor.latestCommitAt)}</td><td className="mono-cell">{contributor.additions === null || contributor.deletions === null ? "—" : `+${formatNumber(contributor.additions)} / -${formatNumber(contributor.deletions)}`}</td></tr>)}</tbody></table></div>; }
function LoadingRows() { return <div className="loading-list">{[1, 2, 3].map((item) => <div className="loading-row" key={item}><span /><span /><span /><span /><span /><span /></div>)}</div>; }
function EmptyReportState({ hasRepositories, onNavigate, onRunCrawl, crawlLoading }: { hasRepositories: boolean; onNavigate: (view: View) => void; onRunCrawl: () => Promise<void>; crawlLoading: boolean }) { return <div className="empty-state"><div className="empty-orbit"><Database size={22} /></div><strong>{hasRepositories ? "Your first snapshot is one crawl away" : "No weekly snapshot yet"}</strong><span>{hasRepositories ? "Your repository is saved. Run a crawl for the previous completed Monday–Sunday window to build the first report." : "Add a public GitHub repository, then run the first crawl to create a weekly report."}</span>{hasRepositories ? <Button variant="outline" size="sm" onClick={() => void onRunCrawl()} disabled={crawlLoading}><Play size={14} /> {crawlLoading ? "Crawling…" : "Run now"}</Button> : <Button variant="outline" size="sm" onClick={() => onNavigate("repositories")}>Set up monitoring <ArrowUpRight size={14} /></Button>}</div>; }
function NoActivityState({ report }: { report: WeeklyReport }) { return <div className="empty-state"><div className="empty-orbit"><Database size={22} /></div><strong>No commits in this report window</strong><span>The crawl completed for {report.repositoryResults.length} monitored {report.repositoryResults.length === 1 ? "repository" : "repositories"}, but GitHub returned no commits from {formatDate(report.weekStart)} through {formatDate(report.weekEnd)}.</span></div>; }
function EmptyMini({ icon, title, detail, onClick }: { icon: React.ReactNode; title: string; detail: string; onClick: () => void }) { return <div className="empty-mini"><div className="empty-mini-icon">{icon}</div><strong>{title}</strong><span>{detail}</span><button className="inline-link" onClick={onClick}>Get started <ArrowUpRight size={13} /></button></div>; }
function RepositoryIssue({ item }: { item: RepositoryResult }) { return <div className="repo-issue"><div className="repo-issue-icon"><AlertTriangle size={15} /></div><div><strong>{item.owner}/{item.name}</strong><span>{item.errorMessage || "Crawl did not complete"}</span></div><Badge variant="outline" className="status-badge status-alert">Error</Badge></div>; }
function LogicRow({ num, title, detail, tone }: { num: string; title: string; detail: string; tone: string }) { return <div className="logic-row"><span className={`logic-num logic-${tone}`}>{num}</span><div><strong>{title}</strong><span>{detail}</span></div></div>; }

function RepositoriesView({ data, api, refresh, setNotice, onRunCrawl, crawlLoading }: { data: ApiState; api: ApiRequest; refresh: () => Promise<void>; setNotice: (notice: { type: "success" | "error"; text: string } | null) => void; onRunCrawl: () => Promise<void>; crawlLoading: boolean }) {
  const [urls, setUrls] = useState(""); const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); setNotice(null); try { await api("/api/repositories", { method: "POST", body: JSON.stringify({ urls }) }); setUrls(""); await refresh(); setNotice({ type: "success", text: "Repository list saved. Run a crawl when you are ready." }); } catch (error) { logClientError("Saving repositories failed", error); setNotice({ type: "error", text: getErrorMessage(error) }); } finally { setSaving(false); } };
  const remove = async (id: string, name: string) => { if (!window.confirm(`Stop monitoring ${name}?`)) return; try { await api(`/api/repositories/${id}`, { method: "DELETE" }); setNotice({ type: "success", text: `${name} removed from monitoring.` }); await refresh(); } catch (error) { logClientError(`Removing repository failed: ${name}`, error); setNotice({ type: "error", text: getErrorMessage(error) }); } };
  return <><PageHeader kicker="Monitoring scope" title="Repositories" description="Choose the public GitHub projects that make up your class workspace." action={data.repositories.length ? <Button variant="outline" size="sm" onClick={onRunCrawl} disabled={crawlLoading}><Play size={14} /> {crawlLoading ? "Crawling…" : "Run now"}</Button> : null} /><div className="split-layout"><section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">Add projects</p><h2>Paste GitHub URLs</h2></div><Github size={18} className="muted-icon" /></div><Textarea value={urls} onChange={(event) => setUrls(event.target.value)} placeholder={'https://github.com/owner/project-one\nhttps://github.com/owner/project-two'} className="form-textarea" /><p className="field-help">One public repository per line. Use Run now whenever you want an updated report.</p><Button onClick={() => void save()} disabled={saving || !urls.trim()}><Plus size={15} /> {saving ? "Saving…" : "Add repositories"}</Button><div className="form-note"><ShieldCheck size={14} /><span>Only public repository metadata and commit history are read.</span></div></section><section className="panel list-panel"><div className="panel-heading"><div><p className="eyebrow">Current scope</p><h2>{data.repositories.length} {data.repositories.length === 1 ? "repository" : "repositories"}</h2></div><span className="panel-meta">{data.repositories.length ? "Monitoring enabled" : "Awaiting setup"}</span></div>{data.repositories.length ? <div className="repo-list">{data.repositories.map((repo) => <div className="repo-list-item" key={repo.id}><div className="repo-symbol"><Code2 size={16} /></div><div className="repo-list-copy"><strong>{repo.owner}/{repo.name}</strong><span>{repo.url}</span></div><span className="repo-active"><span className="status-dot" /> Active</span><button className="icon-button danger" onClick={() => void remove(repo.id, `${repo.owner}/${repo.name}`)} aria-label={`Remove ${repo.owner}/${repo.name}`}><Trash2 size={15} /></button></div>)}</div> : <div className="empty-state small"><div className="empty-orbit"><Code2 size={20} /></div><strong>Your monitoring scope is empty</strong><span>Add the repositories students are expected to use.</span></div>}</section></div></>;
}

function RosterView({ data, api, refresh, setNotice }: { data: ApiState; api: ApiRequest; refresh: () => Promise<void>; setNotice: (notice: { type: "success" | "error"; text: string } | null) => void }) {
  const [usernames, setUsernames] = useState(data.roster.map((member) => member.githubUsername).join("\n")); const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); setNotice(null); try { await api("/api/roster", { method: "PUT", body: JSON.stringify({ usernames: usernames.split(/\r?\n|,|;/).map((value) => value.trim()).filter(Boolean) }) }); setNotice({ type: "success", text: "Class roster saved." }); await refresh(); } catch (error) { logClientError("Saving class roster failed", error); setNotice({ type: "error", text: getErrorMessage(error) }); } finally { setSaving(false); } };
  return <><PageHeader kicker="Class identity" title="Roster" description="Map your class to GitHub usernames so no-commit students can be identified precisely." /><div className="split-layout"><section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">Expected contributors</p><h2>GitHub usernames</h2></div><Users size={18} className="muted-icon" /></div><Textarea value={usernames} onChange={(event) => setUsernames(event.target.value)} placeholder={'student-one\nstudent-two\nstudent-three'} className="form-textarea roster-textarea" /><p className="field-help">One username per line. Usernames are compared across every monitored repository.</p><Button onClick={() => void save()} disabled={saving}><Users size={15} /> {saving ? "Saving…" : "Save class roster"}</Button><div className="form-note"><CircleHelp size={14} /><span>GitHub usernames are case-insensitive and become the canonical identity in reports.</span></div></section><section className="panel list-panel"><div className="panel-heading"><div><p className="eyebrow">Current class</p><h2>{data.roster.length} {data.roster.length === 1 ? "student" : "students"}</h2></div><span className="panel-meta">Cross-repo check</span></div>{data.roster.length ? <div className="roster-list">{data.roster.map((member, index) => <div className="roster-row" key={member.id}><span className="roster-index">{String(index + 1).padStart(2, "0")}</span><span className="avatar">{member.githubUsername.slice(0, 2).toUpperCase()}</span><div><strong>{member.githubUsername}</strong><span>{member.displayName || "GitHub username"}</span></div><a className="icon-button" href={`https://github.com/${member.githubUsername}`} target="_blank" rel="noreferrer" aria-label={`Open ${member.githubUsername} on GitHub`}><ArrowUpRight size={15} /></a></div>)}</div> : <div className="empty-state small"><div className="empty-orbit"><Users size={20} /></div><strong>No class roster yet</strong><span>Import usernames to detect students with no activity.</span></div>}</section></div></>;
}

function HistoryView({ data, api, setNotice }: { data: ApiState; api: ApiRequest; setNotice: (notice: { type: "success" | "error"; text: string } | null) => void }) {
  const [selected, setSelected] = useState<WeeklyReport | null>(null);
  const open = async (weekStart: string) => { try { const result = await api<{ report: WeeklyReport }>(`/api/reports/${weekStart}`); setSelected(result.report); } catch (error) { logClientError(`Opening report failed: ${weekStart}`, error); setNotice({ type: "error", text: getErrorMessage(error) }); } };
  return <><PageHeader kicker="Snapshots" title="Report history" description="Every weekly run is saved as an immutable snapshot for review and follow-up." />{selected ? <section className="panel detail-report"><div className="detail-top"><Button variant="ghost" size="sm" onClick={() => setSelected(null)}>← Back to history</Button><Badge variant="outline" className={`status-badge ${selected.status === "completed" ? "status-ok" : "status-alert"}`}>{selected.status}</Badge></div><div className="detail-title"><div><p className="eyebrow">Weekly snapshot</p><h2>{formatDate(selected.weekStart)} — {formatDate(selected.weekEnd)}</h2></div><span className="panel-meta">Threshold {selected.threshold} lines</span></div><ContributorTable contributors={selected.contributors} /></section> : <section className="panel history-panel"><div className="panel-heading"><div><p className="eyebrow">Saved weekly runs</p><h2>{data.reports.length ? `${data.reports.length} report${data.reports.length > 1 ? "s" : ""}` : "No reports yet"}</h2></div><Clock3 size={18} className="muted-icon" /></div>{data.reports.length ? <div className="history-list">{data.reports.map((item) => <button className="history-row" key={item.id} onClick={() => void open(item.weekStart)}><div className="history-date"><strong>{formatDate(item.weekStart)}</strong><span>{formatDate(item.weekEnd)}</span></div><div className="history-stats"><span>{item.contributors.length} contributors</span><span>{item.repositoryResults.length} repositories</span></div><span className="history-status"><span className={`status-dot ${item.status === "completed" ? "dot-green" : "dot-amber"}`} />{item.status === "completed" ? "Completed" : "Needs review"}</span><ChevronRight size={16} /></button>)}</div> : <div className="empty-state"><div className="empty-orbit"><Clock3 size={22} /></div><strong>History starts after your first crawl</strong><span>Snapshots appear after you run a crawl.</span></div>}</section>}</>;
}

function SettingsView({ data, api, refresh, setNotice }: { data: ApiState; api: ApiRequest; refresh: () => Promise<void>; setNotice: (notice: { type: "success" | "error"; text: string } | null) => void }) {
  const [settings, setSettings] = useState(data.settings); const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); setNotice(null); try { await api("/api/settings", { method: "PUT", body: JSON.stringify(settings) }); setNotice({ type: "success", text: "Settings saved." }); await refresh(); } catch (error) { logClientError("Saving settings failed", error); setNotice({ type: "error", text: getErrorMessage(error) }); } finally { setSaving(false); } };
  return <><PageHeader kicker="Workspace controls" title="Settings" description="Define the weekly window, contribution threshold, and alert destination." /><div className="settings-grid"><section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">Report rules</p><h2>How should we flag work?</h2></div><SlidersHorizontal size={18} className="muted-icon" /></div><label className="field-label">Timezone<select value={settings.timezone} onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}><option>Asia/Bangkok</option><option>UTC</option><option>Asia/Singapore</option><option>Australia/Sydney</option></select></label><label className="field-label">Shallow threshold <span className="field-unit">changed lines</span><Input type="number" min="0" value={settings.shallowThreshold} onChange={(event) => setSettings({ ...settings, shallowThreshold: Number(event.target.value) })} /></label><label className="field-label">Alert email<Input type="email" placeholder="teacher@example.com" value={settings.alertEmail} onChange={(event) => setSettings({ ...settings, alertEmail: event.target.value })} /></label><Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button><div className="form-note"><Clock3 size={14} /><span>Reports cover Monday through Sunday. Start a scan with Run now when you are ready.</span></div></section><section className="panel integration-panel"><div className="panel-heading"><div><p className="eyebrow">Runtime health</p><h2>Integrations</h2></div><ShieldCheck size={18} className="muted-icon" /></div><IntegrationRow icon={<Github size={17} />} title="GitHub REST API" detail={data.integrations.githubToken ? "Authenticated API access with a higher rate limit" : "Public API access is ready; add a token for a higher rate limit"} connected={data.integrations.github} label={data.integrations.githubToken ? "Token connected" : "Public access"} /><IntegrationRow icon={<Mail size={17} />} title="Email delivery" detail="Resend or HTTP email provider" connected={data.integrations.email} /><IntegrationRow icon={<Database size={17} />} title="Local SQLite" detail="Persistent report snapshots" connected={data.integrations.database} /><div className="secret-note"><ShieldCheck size={15} /><span>Secrets stay server-side and are never bundled into the browser.</span></div></section></div></>;
}
function IntegrationRow({ icon, title, detail, connected, label }: { icon: React.ReactNode; title: string; detail: string; connected: boolean; label?: string }) { return <div className="integration-row"><span className={`integration-icon ${connected ? "connected" : ""}`}>{icon}</span><div><strong>{title}</strong><span>{detail}</span></div><Badge variant="outline" className={`integration-badge ${connected ? "connected" : ""}`}><span className="status-dot" />{label ?? (connected ? "Connected" : "Not configured")}</Badge></div>; }
