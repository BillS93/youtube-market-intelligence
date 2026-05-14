import { generateWeeklyReport } from "@/app/actions";
import { Button, EmptyState, PageHeader, Panel } from "@/components/ui";
import { formatDate, formatPercent } from "@/lib/format";
import { parseJsonArray } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

export default async function WeeklyReportPage() {
  const reports = await getPrisma().weeklyReport.findMany({
    orderBy: { createdAt: "desc" },
    take: 20
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly research report"
        description="A stored strategy report generated from saved scores and audits only."
        action={
          <form action={generateWeeklyReport}>
            <Button>Generate report</Button>
          </form>
        }
      />

      <div className="grid gap-4">
        {reports.length === 0 ? (
          <EmptyState>No reports yet.</EmptyState>
        ) : (
          reports.map((report) => (
            <Panel key={report.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-semibold">{report.title}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {formatDate(report.weekStart)} to {formatDate(report.weekEnd)} · Confidence{" "}
                    {formatPercent(report.confidenceScore)}
                  </p>
                </div>
                <div className="text-xs text-muted">Created {formatDate(report.createdAt)}</div>
              </div>
              <pre className="mt-4 whitespace-pre-wrap rounded-md bg-panel-muted p-3 text-sm">
                {report.summary}
              </pre>
              <div className="mt-4 grid gap-1 text-xs text-muted">
                <span>Evidence content IDs: {parseJsonArray(report.evidenceContentItemIds).join(", ") || "none"}</span>
                <span>Evidence audit IDs: {parseJsonArray(report.evidenceAuditIds).join(", ") || "none"}</span>
              </div>
            </Panel>
          ))
        )}
      </div>
    </div>
  );
}
