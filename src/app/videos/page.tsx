import Link from "next/link";

import {
  auditSelectedVideos,
  calculateScores,
  fetchCommentsForOverperformingVideos,
  fetchCommentsForSelectedVideos
} from "@/app/actions";
import { Badge, Button, EmptyState, InlineNotice, Notice, PageHeader, Panel, inputClass } from "@/components/ui";
import { readFeedback } from "@/lib/feedback";
import { formatBigInt, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { parseJsonArray } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

export default async function VideoExplorerPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const feedback = readFeedback(resolvedSearchParams);
  const filter = single(resolvedSearchParams?.filter) ?? "all";
  const prisma = getPrisma();
  const videos = await prisma.contentItem.findMany({
    orderBy: { publishedAt: "desc" },
    include: {
      creator: true,
      comments: true,
      manualNotes: true,
      snapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
      scores: { orderBy: { scoredAt: "desc" }, take: 1 },
      audits: { orderBy: { createdAt: "desc" }, take: 1 }
    },
    take: 250
  });
  const filteredVideos = videos.filter((video) => {
    const score = video.scores[0];
    const audit = video.audits[0];

    if (filter === "top") return (score?.overperformanceScore ?? 0) >= 1.5;
    if (filter === "high-business") return (audit?.businessRelevanceScore ?? 0) >= 7;
    if (filter === "repeatable") return (audit?.repeatabilityScore ?? 0) >= 7;
    if (filter === "low-confidence") return Boolean(audit && audit.confidenceScore < 0.55);
    if (filter === "needs-notes") return !audit || audit.evidenceQuality === "metadata_only" || audit.confidenceScore < 0.65;
    return true;
  });
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
  const videosWithSnapshots = videos.filter((video) => video.snapshots.length > 0).length;
  const videosWithScores = videos.filter((video) => video.scores.length > 0).length;
  const videosWithAudits = videos.filter((video) => video.audits.length > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Video explorer"
        description="Filter videos by performance, business relevance, repeatability, confidence, and evidence needs."
        action={
          <form action={calculateScores}>
            <Button>Calculate scores</Button>
          </form>
        }
      />
      <Notice feedback={feedback} />

      <section className="grid gap-4 md:grid-cols-3">
        <Panel>
          <div className="text-sm text-muted">Videos with snapshots</div>
          <div className="mt-1 text-2xl font-semibold">{videosWithSnapshots}</div>
        </Panel>
        <Panel>
          <div className="text-sm text-muted">Videos with score rows</div>
          <div className="mt-1 text-2xl font-semibold">{videosWithScores}</div>
        </Panel>
        <Panel>
          <div className="text-sm text-muted">Videos with audits</div>
          <div className="mt-1 text-2xl font-semibold">{videosWithAudits}</div>
        </Panel>
      </section>

      <InlineNotice title="Analysis modes">
        Quick uses metadata and performance. Standard adds stored comments. Deep requires manual notes or transcript/excerpt and is for strategic videos only.
      </InlineNotice>

      {!hasOpenAIKey ? (
        <InlineNotice title="AI audit unavailable" tone="error">
          OPENAI_API_KEY is missing. Audit requests will be refused until it is added to .env.local and the dev server is restarted.
        </InlineNotice>
      ) : null}

      <Panel>
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          {[
            ["all", "All"],
            ["top", "Top performers"],
            ["high-business", "High business relevance"],
            ["repeatable", "High repeatability"],
            ["low-confidence", "Low confidence"],
            ["needs-notes", "Needs manual notes"]
          ].map(([value, label]) => (
            <Link
              className={`rounded-md border px-3 py-2 ${filter === value ? "border-accent bg-teal-50 text-accent-strong" : "border-border bg-background"}`}
              href={`/videos?filter=${value}`}
              key={value}
            >
              {label}
            </Link>
          ))}
        </div>

        {videos.length === 0 ? (
          <EmptyState>
            No videos yet. Refresh an approved creator from the Watchlist first so the app can store video metadata and metric snapshots.
          </EmptyState>
        ) : (
          <form action={auditSelectedVideos}>
            <input name="redirectTo" type="hidden" value="/videos" />
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Audit mode</span>
                  <select className={inputClass} name="analysisDepth" defaultValue="quick">
                    <option value="quick">Quick: metadata + performance</option>
                    <option value="standard">Standard: comments if fetched</option>
                    <option value="deep">Deep: requires manual notes/transcript</option>
                  </select>
                </label>
                <div className="flex items-end gap-2">
                  <Button disabled={!hasOpenAIKey}>Audit selected</Button>
                  <Button tone="secondary" type="submit" disabled={!hasOpenAIKey}>
                    Run selected mode
                  </Button>
                </div>
              </div>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              <p className="basis-full text-xs text-muted">
                Comment fetch estimate: 1 YouTube quota unit per selected video, up to 25 comments each.
              </p>
              <Button tone="secondary" formAction={fetchCommentsForSelectedVideos}>
                Fetch comments for selected
              </Button>
              <Button tone="secondary" formAction={fetchCommentsForOverperformingVideos}>
                Fetch comments for recent overperformers
              </Button>
              <input name="maxResults" type="hidden" value="25" />
            </div>
            <VideoTable videos={filteredVideos} hasOpenAIKey={hasOpenAIKey} />
          </form>
        )}
      </Panel>
    </div>
  );
}

function VideoTable({
  videos,
  hasOpenAIKey
}: {
  videos: VideoRow[];
  hasOpenAIKey: boolean;
}) {
  if (videos.length === 0) {
    return <EmptyState>No videos match this filter.</EmptyState>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted">
          <tr>
            <th className="py-2 pr-3">Select</th>
            <th className="py-2 pr-3">Video</th>
            <th className="py-2 pr-3">Creator</th>
            <th className="py-2 pr-3">Format</th>
            <th className="py-2 pr-3">Views</th>
            <th className="py-2 pr-3">Over</th>
            <th className="py-2 pr-3">Audit</th>
            <th className="py-2 pr-3">Evidence</th>
            <th className="py-2 pr-3">Business</th>
            <th className="py-2 pr-3">Repeat</th>
            <th className="py-2 pr-3">Confidence</th>
            <th className="py-2 pr-3">Flags</th>
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
                    aria-label={`Select ${video.title}`}
                    disabled={!snapshot || !hasOpenAIKey}
                    name="contentItemId"
                    type="checkbox"
                    value={video.id}
                  />
                </td>
                <td className="max-w-sm py-3 pr-3">
                  <Link className="font-medium hover:text-accent" href={`/videos/${video.id}`}>
                    {video.title}
                  </Link>
                  <div className="mt-1 text-xs text-muted">{formatDate(video.publishedAt)}</div>
                  <div className="mt-1 text-xs text-muted">{video.comments.length} comments stored</div>
                </td>
                <td className="py-3 pr-3">{video.creator.name}</td>
                <td className="py-3 pr-3">{video.formatType}</td>
                <td className="py-3 pr-3">{formatBigInt(snapshot?.viewCount)}</td>
                <td className="py-3 pr-3">{formatNumber(score?.overperformanceScore)}x</td>
                <td className="py-3 pr-3">{audit ? audit.analysisDepth : "none"}</td>
                <td className="py-3 pr-3">{audit?.evidenceQuality ?? "not audited"}</td>
                <td className="py-3 pr-3">{audit?.businessRelevanceScore ?? "unknown"}</td>
                <td className="py-3 pr-3">{audit?.repeatabilityScore ?? "unknown"}</td>
                <td className="py-3 pr-3">{formatPercent(audit?.confidenceScore)}</td>
                <td className="py-3 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {parseJsonArray(score?.flags).map((flag) => (
                      <Badge key={flag}>{flag}</Badge>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

type VideoRow = Awaited<ReturnType<typeof getPrisma>>["contentItem"] extends never
  ? never
  : {
      id: string;
      title: string;
      publishedAt: Date | null;
      formatType: string;
      creator: { name: string };
      comments: { id: string }[];
      snapshots: { viewCount: bigint | null }[];
      scores: { overperformanceScore: number | null; flags: string }[];
      audits: {
        analysisDepth: string;
        evidenceQuality: string;
        businessRelevanceScore: number | null;
        repeatabilityScore: number | null;
        confidenceScore: number;
      }[];
    };
