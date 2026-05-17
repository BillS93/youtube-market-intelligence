import Link from "next/link";

import { fetchCommentsForTopBottomVideos, generateCreatorPatternReports } from "@/app/actions";
import { Badge, Button, EmptyState, Notice, PageHeader, Panel } from "@/components/ui";
import { readFeedback } from "@/lib/feedback";
import { formatNumber } from "@/lib/format";
import { parseJsonArray, parseJsonRecord } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

export default async function ComparePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const feedback = readFeedback(await searchParams);
  const prisma = getPrisma();
  const [top, bottom, reports] = await Promise.all([
    prisma.performanceScore.findMany({
      where: { formatType: "long_form", overperformanceScore: { not: null } },
      orderBy: { overperformanceScore: "desc" },
      take: 10,
      include: { contentItem: { include: { creator: true, audits: { orderBy: { createdAt: "desc" }, take: 1 } } } }
    }),
    prisma.performanceScore.findMany({
      where: { formatType: "long_form", overperformanceScore: { not: null } },
      orderBy: { overperformanceScore: "asc" },
      take: 10,
      include: { contentItem: { include: { creator: true, audits: { orderBy: { createdAt: "desc" }, take: 1 } } } }
    }),
    prisma.creatorPatternReport.findMany({
      orderBy: { createdAt: "desc" },
      take: 12
    })
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Top vs bottom comparison"
        description="Compare videos only within matching format types, then generate creator-specific pattern reports."
        action={
          <div className="flex flex-wrap gap-2">
            <form action={fetchCommentsForTopBottomVideos}>
              <input name="maxResults" type="hidden" value="25" />
              <Button tone="secondary">Fetch top/bottom comments</Button>
            </form>
            <form action={generateCreatorPatternReports}>
              <Button>Generate creator patterns</Button>
            </form>
          </div>
        }
      />
      <Notice feedback={feedback} />
      <p className="text-sm text-muted">
        Comment fetch estimate: 1 YouTube quota unit per top/bottom video selected by this page, up to 25 comments each.
      </p>

      {top.length === 0 && bottom.length === 0 ? (
        <EmptyState>
          No scored long-form videos yet. Refresh a creator, calculate scores, and make sure at least one long-form video has enough baseline data.
        </EmptyState>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          <ComparisonPanel title="Top long-form" scores={top} />
          <ComparisonPanel title="Bottom long-form" scores={bottom} />
        </section>
      )}

      <Panel>
        <h3 className="font-semibold">Creator pattern reports</h3>
        <p className="mt-1 text-sm text-muted">
          Reports require comparable videos within the same format type. Fewer than 5 videos are marked low confidence.
        </p>
        <div className="mt-4 grid gap-3">
          {reports.map((report) => {
            const parsed = parseJsonRecord<CreatorPatternJson>(report.structuredJson, {});
            return (
              <div className="rounded-md border border-border bg-background p-4" key={report.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold">{report.creatorName}</h4>
                  <Badge>{report.formatType}</Badge>
                  <Badge>{report.videosAnalyzedCount} videos</Badge>
                  <Badge>{formatNumber(report.confidenceScore)} confidence</Badge>
                </div>
                <div className="mt-3 grid gap-4 md:grid-cols-3">
                  <PatternList title="Adapt these" items={parsed.lessons_for_my_channel?.adapt_these_patterns} />
                  <PatternList title="Avoid these" items={parsed.lessons_for_my_channel?.avoid_these_patterns} />
                  <PatternList title="Experiments" items={parsed.lessons_for_my_channel?.suggested_experiments} />
                </div>
                <div className="mt-3 text-xs text-muted">
                  Evidence videos: {parseJsonArray(report.topVideoIds).concat(parseJsonArray(report.bottomVideoIds)).join(", ") || "none"}
                </div>
              </div>
            );
          })}
          {reports.length === 0 ? (
            <EmptyState>No creator pattern reports yet. Generate them after scores and audits exist.</EmptyState>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function ComparisonPanel({
  title,
  scores
}: {
  title: string;
  scores: Awaited<ReturnType<typeof getScoresForType>>;
}) {
  return (
    <Panel>
      <h3 className="font-semibold">{title}</h3>
      {scores.length === 0 ? (
        <EmptyState>No videos in this comparison group yet.</EmptyState>
      ) : (
        <div className="mt-4 grid gap-3">
          {scores.map((score) => {
            const audit = score.contentItem.audits[0];
            return (
              <div className="rounded-md border border-border bg-background p-3" key={score.id}>
                <Link className="font-medium hover:text-accent" href={`/videos/${score.contentItemId}`}>
                  {score.contentItem.title}
                </Link>
                <div className="mt-1 text-sm text-muted">
                  {score.contentItem.creator.name} - {formatNumber(score.overperformanceScore)}x baseline -{" "}
                  {formatNumber(score.percentileWithinCreator)} creator percentile
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {parseJsonArray(score.flags).map((flag) => (
                    <Badge key={flag}>{flag}</Badge>
                  ))}
                  {audit ? <Badge>{audit.evidenceQuality}</Badge> : null}
                </div>
                {audit ? (
                  <p className="mt-3 text-sm text-muted">{audit.suggestedAdaptationForUser}</p>
                ) : (
                  <p className="mt-3 text-sm text-muted">No audit saved for this video yet.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function PatternList({ title, items }: { title: string; items?: string[] }) {
  const values = items?.filter(Boolean) ?? [];
  return (
    <div>
      <h5 className="text-sm font-medium">{title}</h5>
      <ul className="mt-2 grid gap-1 text-sm text-muted">
        {values.slice(0, 5).map((item) => (
          <li key={item}>{item}</li>
        ))}
        {values.length === 0 ? <li>Not enough audited evidence yet.</li> : null}
      </ul>
    </div>
  );
}

async function getScoresForType() {
  return getPrisma().performanceScore.findMany({
    include: { contentItem: { include: { creator: true, audits: true } } }
  });
}

type CreatorPatternJson = {
  lessons_for_my_channel?: {
    adapt_these_patterns?: string[];
    avoid_these_patterns?: string[];
    suggested_experiments?: string[];
  };
};
