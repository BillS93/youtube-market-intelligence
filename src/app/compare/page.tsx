import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { parseJsonArray } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

export default async function ComparePage() {
  const prisma = getPrisma();
  const [top, bottom] = await Promise.all([
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
    })
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Top vs bottom comparison"
        description="Long-form videos are compared separately from short candidates and normalized against creator baselines."
      />

      {top.length === 0 && bottom.length === 0 ? (
        <EmptyState>No scored long-form videos yet.</EmptyState>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          <ComparisonPanel title="Top long-form" scores={top} />
          <ComparisonPanel title="Bottom long-form" scores={bottom} />
        </section>
      )}
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
      <div className="mt-4 grid gap-3">
        {scores.map((score) => {
          const audit = score.contentItem.audits[0];
          return (
            <div className="rounded-md border border-border bg-background p-3" key={score.id}>
              <div className="font-medium">{score.contentItem.title}</div>
              <div className="mt-1 text-sm text-muted">
                {score.contentItem.creator.name} · {formatNumber(score.overperformanceScore)}x baseline ·{" "}
                {formatNumber(score.percentileWithinCreator)} creator percentile
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {parseJsonArray(score.flags).map((flag) => (
                  <Badge key={flag}>{flag}</Badge>
                ))}
              </div>
              {audit ? (
                <p className="mt-3 text-sm text-muted">{audit.suggestedAdaptationForUser}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

async function getScoresForType() {
  return getPrisma().performanceScore.findMany({
    include: { contentItem: { include: { creator: true, audits: true } } }
  });
}
