import { auditSelectedVideos, calculateScores } from "@/app/actions";
import { Badge, Button, EmptyState, PageHeader, Panel } from "@/components/ui";
import { formatBigInt, formatDate, formatNumber } from "@/lib/format";
import { parseJsonArray } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

export default async function VideoExplorerPage() {
  const videos = await getPrisma().contentItem.findMany({
    orderBy: { publishedAt: "desc" },
    include: {
      creator: true,
      snapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
      scores: { orderBy: { scoredAt: "desc" }, take: 1 },
      audits: { orderBy: { createdAt: "desc" }, take: 1 }
    },
    take: 200
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Video explorer"
        description="Tracked uploads, latest metric snapshots, normalized scores, and audit status."
        action={
          <form action={calculateScores}>
            <Button>Calculate scores</Button>
          </form>
        }
      />

      <Panel>
        {videos.length === 0 ? (
          <EmptyState>No videos yet. Refresh approved creators first.</EmptyState>
        ) : (
          <form action={auditSelectedVideos}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted">Select videos with evidence snapshots to audit.</p>
              <Button>Audit selected</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted">
                  <tr>
                    <th className="py-2 pr-3">Audit</th>
                    <th className="py-2 pr-3">Video</th>
                    <th className="py-2 pr-3">Creator</th>
                    <th className="py-2 pr-3">Format</th>
                    <th className="py-2 pr-3">Published</th>
                    <th className="py-2 pr-3">Views</th>
                    <th className="py-2 pr-3">V/day</th>
                    <th className="py-2 pr-3">Over</th>
                    <th className="py-2 pr-3">Flags</th>
                    <th className="py-2 pr-3">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {videos.map((video) => {
                    const snapshot = video.snapshots[0];
                    const score = video.scores[0];
                    const audit = video.audits[0];
                    return (
                      <tr className="border-t border-border" key={video.id}>
                        <td className="py-3 pr-3">
                          <input
                            aria-label={`Audit ${video.title}`}
                            disabled={!snapshot}
                            name="contentItemId"
                            type="checkbox"
                            value={video.id}
                          />
                        </td>
                        <td className="max-w-sm py-3 pr-3">
                          {video.url ? (
                            <a className="hover:text-accent" href={video.url} rel="noreferrer" target="_blank">
                              {video.title}
                            </a>
                          ) : (
                            video.title
                          )}
                        </td>
                        <td className="py-3 pr-3">{video.creator.name}</td>
                        <td className="py-3 pr-3">{video.formatType}</td>
                        <td className="py-3 pr-3">{formatDate(video.publishedAt)}</td>
                        <td className="py-3 pr-3">{formatBigInt(snapshot?.viewCount)}</td>
                        <td className="py-3 pr-3">{formatNumber(score?.viewsPerDay)}</td>
                        <td className="py-3 pr-3">{formatNumber(score?.overperformanceScore)}x</td>
                        <td className="py-3 pr-3">
                          <div className="flex flex-wrap gap-1">
                            {parseJsonArray(score?.flags).map((flag) => (
                              <Badge key={flag}>{flag}</Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 pr-3">
                          {audit ? `${Math.round(audit.confidenceScore * 100)}%` : "none"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}
