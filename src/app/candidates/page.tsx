import { approveCandidate, rejectCandidate } from "@/app/actions";
import { Badge, Button, EmptyState, Notice, PageHeader, Panel } from "@/components/ui";
import { readFeedback } from "@/lib/feedback";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";

export default async function CandidatesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const feedback = readFeedback(await searchParams);
  const candidates = await getPrisma().discoveryCandidate.findMany({
    orderBy: { discoveredAt: "desc" },
    include: { query: true, creator: true },
    take: 100
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Candidates approval"
        description="Approve one relevant YouTube channel into the watchlist before refreshing videos."
      />
      <Notice feedback={feedback} />

      <Panel>
        {candidates.length === 0 ? (
          <EmptyState>
            No candidates yet. Go to Discovery, run one tiny query, then return here to approve a channel into the watchlist.
          </EmptyState>
        ) : (
          <div className="grid gap-3">
            {candidates.map((candidate) => (
              <div className="rounded-md border border-border bg-background p-4" key={candidate.id}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{candidate.title}</h3>
                      <Badge>{candidate.status}</Badge>
                      <Badge>{candidate.query.layer}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm text-muted">
                      {candidate.description || "No channel description returned by YouTube."}
                    </p>
                    <div className="mt-3 text-xs text-muted">
                      Query: {candidate.query.query} - Channel ID: {candidate.channelId} -{" "}
                      {formatDate(candidate.discoveredAt)}
                    </div>
                    {candidate.evidenceTitle ? (
                      <div className="mt-2 text-xs text-muted">
                        Video evidence: {candidate.evidenceTitle}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex min-w-48 flex-col gap-2">
                    {candidate.status === "pending" ? (
                      <>
                        <form action={approveCandidate}>
                          <input name="candidateId" type="hidden" value={candidate.id} />
                          <Button>Approve to watchlist</Button>
                        </form>
                        <form action={rejectCandidate}>
                          <input name="candidateId" type="hidden" value={candidate.id} />
                          <Button tone="danger">Reject</Button>
                        </form>
                      </>
                    ) : (
                      <div className="text-sm text-muted">
                        {candidate.status === "approved"
                          ? "Already approved. Next step: refresh this creator from the watchlist."
                          : "Rejected."}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
