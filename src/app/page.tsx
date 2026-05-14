import Link from "next/link";

import { getDashboardStats } from "@/lib/dashboard";
import { formatNumber, formatPercent } from "@/lib/format";

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Start with limited discovery, approve creators into the watchlist,
          refresh their recent uploads, calculate normalized performance, then
          audit selected videos with stored evidence.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Approved creators" value={stats.approvedCreators} />
        <Metric label="Pending candidates" value={stats.pendingCandidates} />
        <Metric label="Tracked videos" value={stats.contentItems} />
        <Metric label="Audits" value={stats.audits} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-panel p-4">
          <h3 className="font-semibold">Recent top performers</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="py-2 pr-3">Video</th>
                  <th className="py-2 pr-3">Creator</th>
                  <th className="py-2 pr-3">Over</th>
                  <th className="py-2 pr-3">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {stats.topVideos.map((item) => (
                  <tr className="border-t border-border" key={item.id}>
                    <td className="py-3 pr-3">
                      <Link className="hover:text-accent" href="/videos">
                        {item.title}
                      </Link>
                    </td>
                    <td className="py-3 pr-3">{item.creatorName}</td>
                    <td className="py-3 pr-3">
                      {formatNumber(item.overperformanceScore)}x
                    </td>
                    <td className="py-3 pr-3">
                      {formatPercent(item.confidenceScore)}
                    </td>
                  </tr>
                ))}
                {stats.topVideos.length === 0 ? (
                  <tr>
                    <td className="py-4 text-muted" colSpan={4}>
                      No scored videos yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-panel p-4">
          <h3 className="font-semibold">Next actions</h3>
          <div className="mt-4 grid gap-3 text-sm">
            <ActionLink href="/discovery" label="Run limited discovery" />
            <ActionLink href="/candidates" label="Approve candidates" />
            <ActionLink href="/watchlist" label="Refresh approved creators" />
            <ActionLink href="/videos" label="Calculate scores and audit videos" />
            <ActionLink href="/report" label="Generate weekly report" />
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="rounded-md border border-border bg-background px-3 py-2 hover:border-accent"
      href={href}
    >
      {label}
    </Link>
  );
}
