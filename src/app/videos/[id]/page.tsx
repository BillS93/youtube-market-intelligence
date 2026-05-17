import { notFound } from "next/navigation";

import {
  auditSelectedVideos,
  fetchCommentsForSelectedVideos,
  saveManualEvidenceNotes
} from "@/app/actions";
import { Badge, Button, EmptyState, Field, Notice, PageHeader, Panel, inputClass } from "@/components/ui";
import { readFeedback } from "@/lib/feedback";
import { formatBigInt, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { parseJsonArray, parseJsonRecord } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

export default async function VideoDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(undefined)
  ]);
  const feedback = readFeedback(resolvedSearchParams);
  const video = await getPrisma().contentItem.findUnique({
    where: { id },
    include: {
      creator: true,
      comments: { orderBy: [{ likeCount: "desc" }, { capturedAt: "desc" }], take: 25 },
      manualNotes: { orderBy: { updatedAt: "desc" }, take: 5 },
      snapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
      scores: { orderBy: { scoredAt: "desc" }, take: 1 },
      audits: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });

  if (!video) {
    notFound();
  }

  const snapshot = video.snapshots[0];
  const score = video.scores[0];
  const audit = video.audits[0];
  const fullAudit = parseJsonRecord<AuditJson>(audit?.fullAuditJson, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title={video.title}
        description={`${video.creator.name} - ${video.formatType} - ${formatDate(video.publishedAt)}`}
        action={
          video.url ? (
            <a
              className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:border-accent"
              href={video.url}
              rel="noreferrer"
              target="_blank"
            >
              Open on YouTube
            </a>
          ) : null
        }
      />
      <Notice feedback={feedback} />

      <section className="grid gap-4 md:grid-cols-4">
        <Panel>
          <div className="text-sm text-muted">Views</div>
          <div className="mt-1 text-2xl font-semibold">{formatBigInt(snapshot?.viewCount)}</div>
        </Panel>
        <Panel>
          <div className="text-sm text-muted">Views/day</div>
          <div className="mt-1 text-2xl font-semibold">{formatNumber(score?.viewsPerDay)}</div>
        </Panel>
        <Panel>
          <div className="text-sm text-muted">Overperformance</div>
          <div className="mt-1 text-2xl font-semibold">{formatNumber(score?.overperformanceScore)}x</div>
        </Panel>
        <Panel>
          <div className="text-sm text-muted">Audit confidence</div>
          <div className="mt-1 text-2xl font-semibold">{formatPercent(audit?.confidenceScore)}</div>
        </Panel>
      </section>

      <Panel>
        <h3 className="font-semibold">Performance context</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {parseJsonArray(score?.flags).map((flag) => (
            <Badge key={flag}>{flag}</Badge>
          ))}
          {audit ? <Badge>{audit.evidenceQuality}</Badge> : <Badge>not audited</Badge>}
          {audit ? <Badge>{audit.analysisDepth}</Badge> : null}
        </div>
        <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
          <p>Creator median views/day: {formatNumber(score?.creatorMedianViewsPerDay)}</p>
          <p>Creator percentile: {formatNumber(score?.percentileWithinCreator)}</p>
          <p>Layer percentile: {formatNumber(score?.percentileWithinLayer)}</p>
          <p>Stored comments: {video.comments.length}</p>
        </div>
      </Panel>

      <Panel>
        <h3 className="font-semibold">Video breakdown</h3>
        {!audit ? (
          <EmptyState>
            No audit yet. Run a quick audit from the Videos page, fetch comments for a standard audit, or add manual notes below for a deep audit.
          </EmptyState>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <AnalysisBlock title="Why it likely worked" items={fullAudit.performance_interpretation?.likely_reasons_it_performed} fallback={audit.whyItLikelyPerformed} />
            <AnalysisBlock title="Why it might not repeat" items={fullAudit.performance_interpretation?.why_it_might_not_be_repeatable} fallback={audit.whyItMightUnderperform} />
            <AnalysisBlock title="What to adapt" items={fullAudit.strategic_application_for_my_channel?.how_to_adapt_ethically} fallback={audit.suggestedAdaptationForUser} />
            <AnalysisBlock title="What not to copy" items={fullAudit.strategic_application_for_my_channel?.what_not_to_copy} fallback="No specific non-copy guidance stored." />
            <AnalysisBlock title="Specific video ideas for my channel" items={fullAudit.strategic_application_for_my_channel?.specific_video_ideas_for_me} fallback="No specific ideas stored." />
            <AnalysisBlock title="Evidence limitations" items={parseJsonArray(audit.evidenceLimitations)} fallback={audit.risksOrCaveats} />
          </div>
        )}
      </Panel>

      <Panel>
        <h3 className="font-semibold">Evidence drawer</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h4 className="font-medium">Observable evidence</h4>
            <pre className="mt-2 whitespace-pre-wrap rounded-md bg-panel-muted p-3 text-sm">
              {audit?.observableEvidence || "No audit evidence stored yet."}
            </pre>
          </div>
          <div>
            <h4 className="font-medium">Interpretation</h4>
            <pre className="mt-2 whitespace-pre-wrap rounded-md bg-panel-muted p-3 text-sm">
              {audit?.interpretation || "No interpretation stored yet."}
            </pre>
          </div>
          <div>
            <h4 className="font-medium">Top stored comments</h4>
            <div className="mt-2 grid gap-2 text-sm">
              {video.comments.slice(0, 5).map((comment) => (
                <div className="rounded-md border border-border bg-background p-2" key={comment.id}>
                  <div className="text-xs text-muted">
                    {comment.authorDisplayName ?? "unknown"} - {comment.likeCount ?? 0} likes
                  </div>
                  <p className="mt-1">{comment.text}</p>
                </div>
              ))}
              {video.comments.length === 0 ? <p className="text-muted">No comments stored.</p> : null}
            </div>
          </div>
          <div>
            <h4 className="font-medium">Evidence IDs</h4>
            <div className="mt-2 grid gap-1 text-xs text-muted">
              <span>Content: {audit ? parseJsonArray(audit.evidenceContentItemIds).join(", ") : video.id}</span>
              <span>Snapshot: {audit ? parseJsonArray(audit.evidenceSnapshotIds).join(", ") : snapshot?.id ?? "none"}</span>
              <span>Scores: {audit ? parseJsonArray(audit.evidenceScoreIds).join(", ") : score?.id ?? "none"}</span>
              <span>Comments: {audit ? parseJsonArray(audit.evidenceCommentIds).join(", ") || "none" : "none"}</span>
              <span>Manual notes: {audit ? parseJsonArray(audit.manualNoteIds).join(", ") || "none" : "none"}</span>
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        <h3 className="font-semibold">Run analysis on this video</h3>
        <form action={auditSelectedVideos} className="mt-4 flex flex-wrap items-end gap-3">
          <input name="contentItemId" type="hidden" value={video.id} />
          <input name="redirectTo" type="hidden" value={`/videos/${video.id}`} />
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Mode</span>
            <select className={inputClass} name="analysisDepth" defaultValue="quick">
              <option value="quick">Quick: metadata + performance</option>
              <option value="standard">Standard: comments if fetched</option>
              <option value="deep">Deep: manual notes/transcript required</option>
            </select>
          </label>
          <Button>Audit this video</Button>
          <Button formAction={fetchCommentsForSelectedVideos} tone="secondary">
            Fetch comments
          </Button>
          <input name="maxResults" type="hidden" value="25" />
        </form>
      </Panel>

      <Panel>
        <h3 className="font-semibold">Manual Evidence Notes</h3>
        <p className="mt-1 text-sm text-muted">
          Add notes only after watching the video. These are treated as stronger evidence than title/description metadata.
        </p>
        <form action={saveManualEvidenceNotes} className="mt-4 grid gap-4">
          <input name="contentItemId" type="hidden" value={video.id} />
          <input name="redirectTo" type="hidden" value={`/videos/${video.id}`} />
          <label className="flex items-center gap-2 text-sm">
            <input name="watchedByUser" type="checkbox" />
            Watched by user
          </label>
          <Field label="Opening hook notes">
            <textarea className={inputClass} name="openingHookNotes" rows={2} />
          </Field>
          <Field label="Video structure notes">
            <textarea className={inputClass} name="videoStructureNotes" rows={2} />
          </Field>
          <Field label="Coaching delivery notes">
            <textarea className={inputClass} name="coachingDeliveryNotes" rows={2} />
          </Field>
          <Field label="Exercise or training content notes">
            <textarea className={inputClass} name="exerciseOrTrainingContentNotes" rows={2} />
          </Field>
          <Field label="Science or claims notes">
            <textarea className={inputClass} name="scienceOrClaimsNotes" rows={2} />
          </Field>
          <Field label="CTA or offer notes">
            <textarea className={inputClass} name="ctaOrOfferNotes" rows={2} />
          </Field>
          <Field label="Transcript or excerpt">
            <textarea className={inputClass} name="transcriptOrExcerpt" rows={4} />
          </Field>
          <Field label="User notes">
            <textarea className={inputClass} name="userNotes" rows={3} />
          </Field>
          <div>
            <Button>Save manual evidence</Button>
          </div>
        </form>
      </Panel>

      <Panel>
        <h3 className="font-semibold">Saved manual notes</h3>
        {video.manualNotes.length === 0 ? (
          <EmptyState>No manual notes saved yet.</EmptyState>
        ) : (
          <div className="mt-4 grid gap-3">
            {video.manualNotes.map((note) => (
              <div className="rounded-md border border-border bg-background p-3 text-sm" key={note.id}>
                <div className="text-xs text-muted">Updated {formatDate(note.updatedAt)}</div>
                <pre className="mt-2 whitespace-pre-wrap">
                  {[note.openingHookNotes, note.videoStructureNotes, note.coachingDeliveryNotes, note.exerciseOrTrainingContentNotes, note.scienceOrClaimsNotes, note.ctaOrOfferNotes, note.transcriptOrExcerpt, note.userNotes]
                    .filter(Boolean)
                    .join("\n\n")}
                </pre>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function AnalysisBlock({
  title,
  items,
  fallback
}: {
  title: string;
  items?: string[];
  fallback: string;
}) {
  const values = items && items.length > 0 ? items : fallback.split("\n").filter(Boolean);

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <h4 className="font-medium">{title}</h4>
      <ul className="mt-2 grid gap-2 text-sm text-muted">
        {values.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

type AuditJson = {
  performance_interpretation?: {
    likely_reasons_it_performed?: string[];
    why_it_might_not_be_repeatable?: string[];
  };
  strategic_application_for_my_channel?: {
    how_to_adapt_ethically?: string[];
    what_not_to_copy?: string[];
    specific_video_ideas_for_me?: string[];
  };
};
