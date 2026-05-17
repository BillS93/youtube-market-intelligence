import {
  generateContentBriefs,
  generateTrendReport,
  generateWeeklyReport
} from "@/app/actions";
import { Badge, Button, EmptyState, InlineNotice, Notice, PageHeader, Panel } from "@/components/ui";
import { readFeedback } from "@/lib/feedback";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import { parseJsonArray, parseJsonRecord } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

export default async function WeeklyReportPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const feedback = readFeedback(await searchParams);
  const prisma = getPrisma();
  const [reports, eligibleEvidenceCount, trendReports, briefs] = await Promise.all([
    prisma.weeklyReport.findMany({
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.performanceScore.count({
      where: {
        formatType: "long_form",
        overperformanceScore: { not: null },
        contentItem: { audits: { some: {} } }
      }
    }),
    prisma.trendReport.findMany({
      orderBy: { createdAt: "desc" },
      take: 5
    }),
    prisma.contentBrief.findMany({
      orderBy: { createdAt: "desc" },
      take: 12
    })
  ]);
  const compliantReports = reports
    .map((report) => ({
      report,
      evidenceContentItemIds: parseJsonArray(report.evidenceContentItemIds),
      evidenceAuditIds: parseJsonArray(report.evidenceAuditIds)
    }))
    .filter(
      (item) =>
        item.evidenceContentItemIds.length > 0 && item.evidenceAuditIds.length > 0
    )
    .slice(0, 20);
  const excludedReports = reports.length - compliantReports.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Research reports and content briefs"
        description="Cross-creator trends, business-relevant opportunities, weekly summaries, and video briefs from stored evidence only."
        action={
          <div className="flex flex-wrap gap-2">
            <form action={generateTrendReport}>
              <Button>Generate trend report</Button>
            </form>
            <form action={generateContentBriefs}>
              <Button tone="secondary">Generate briefs</Button>
            </form>
            <form action={generateWeeklyReport}>
              <Button disabled={eligibleEvidenceCount === 0} tone="secondary">
                Generate weekly report
              </Button>
            </form>
          </div>
        }
      />
      <Notice feedback={feedback} />

      <InlineNotice title="Trend evidence rule">
        A cross-creator pattern requires at least 2 creators or at least 5 supporting videos. The app says “observed in this watchlist,” never platform-wide trend or algorithm cause.
      </InlineNotice>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="font-semibold">Strongest cross-creator patterns</h3>
          <div className="mt-4 grid gap-3">
            {trendReports.slice(0, 1).flatMap((report) => {
              const parsed = parseJsonRecord<TrendJson>(report.structuredJson, {});
              return (parsed.strongest_patterns ?? []).slice(0, 6).map((pattern) => (
                <div className="rounded-md border border-border bg-background p-3" key={pattern.pattern_name}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium">{pattern.pattern_name}</h4>
                    <Badge>{pattern.pattern_type}</Badge>
                    <Badge>score {formatNumber(pattern.pattern_score)}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted">{pattern.interpretation}</p>
                  <p className="mt-2 text-sm">{pattern.recommended_action}</p>
                  <div className="mt-2 text-xs text-muted">
                    Evidence videos: {pattern.supporting_video_ids.join(", ")}
                  </div>
                </div>
              ));
            })}
            {trendReports.length === 0 ? (
              <EmptyState>No trend report yet. Generate one after audits exist.</EmptyState>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <h3 className="font-semibold">Business-relevant opportunities</h3>
          <div className="mt-4 grid gap-3">
            {trendReports.slice(0, 1).flatMap((report) => {
              const parsed = parseJsonRecord<TrendJson>(report.structuredJson, {});
              return (parsed.content_opportunities_for_my_channel ?? []).slice(0, 6).map((opportunity) => (
                <div className="rounded-md border border-border bg-background p-3" key={opportunity.idea}>
                  <div className="font-medium">{opportunity.idea}</div>
                  <p className="mt-2 text-sm text-muted">{opportunity.why_it_is_supported_by_research}</p>
                  <p className="mt-2 text-sm">{opportunity.business_connection}</p>
                </div>
              ));
            })}
            {trendReports.length === 0 ? (
              <EmptyState>No opportunities yet. Generate a trend report first.</EmptyState>
            ) : null}
          </div>
        </Panel>
      </section>

      <Panel>
        <h3 className="font-semibold">Practical content briefs</h3>
        <div className="mt-4 grid gap-3">
          {briefs.map((brief) => (
            <div className="rounded-md border border-border bg-background p-4" key={brief.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold">{brief.titleIdea}</h4>
                <Badge>{brief.platform}</Badge>
                <Badge>{formatPercent(brief.confidenceScore)}</Badge>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <BriefLine label="Audience" value={brief.targetAudience} />
                <BriefLine label="Business objective" value={brief.businessObjective} />
                <BriefLine label="Opening hook" value={brief.openingHook} />
                <BriefLine label="CTA" value={brief.cta} />
              </div>
              <div className="mt-3">
                <BriefLine label="Structure" value={brief.videoStructure} />
              </div>
              <div className="mt-3 text-xs text-muted">
                Evidence videos: {parseJsonArray(brief.evidenceVideoIds).join(", ")}
              </div>
            </div>
          ))}
          {briefs.length === 0 ? (
            <EmptyState>No briefs yet. Generate a trend report, then generate briefs.</EmptyState>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <h3 className="font-semibold">Weekly evidence summaries</h3>
        {excludedReports > 0 ? (
          <InlineNotice title="Older reports hidden" tone="info">
            {excludedReports} stored report{excludedReports === 1 ? "" : "s"} without audit evidence are hidden from this page.
          </InlineNotice>
        ) : null}
        <div className="mt-4 grid gap-4">
          {compliantReports.length === 0 ? (
            <EmptyState>
              No compliant weekly summaries yet. Score videos, audit at least one scored long-form video, then generate the first weekly report.
            </EmptyState>
          ) : (
            compliantReports.map(({ report, evidenceContentItemIds, evidenceAuditIds }) => (
              <div className="rounded-md border border-border bg-background p-4" key={report.id}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="font-semibold">{report.title}</h4>
                    <p className="mt-1 text-sm text-muted">
                      {formatDate(report.weekStart)} to {formatDate(report.weekEnd)} - Confidence{" "}
                      {formatPercent(report.confidenceScore)}
                    </p>
                  </div>
                  <div className="text-xs text-muted">Created {formatDate(report.createdAt)}</div>
                </div>
                <pre className="mt-4 whitespace-pre-wrap rounded-md bg-panel-muted p-3 text-sm">
                  {report.summary}
                </pre>
                <div className="mt-4 grid gap-1 text-xs text-muted">
                  <span>Evidence content IDs: {evidenceContentItemIds.join(", ")}</span>
                  <span>Evidence audit IDs: {evidenceAuditIds.join(", ")}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

function BriefLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted">{label}</div>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

type TrendJson = {
  strongest_patterns?: {
    pattern_name: string;
    pattern_type: string;
    supporting_video_ids: string[];
    pattern_score: number;
    interpretation: string;
    recommended_action: string;
  }[];
  content_opportunities_for_my_channel?: {
    idea: string;
    why_it_is_supported_by_research: string;
    business_connection: string;
  }[];
};
