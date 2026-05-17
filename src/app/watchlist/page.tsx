import Link from "next/link";

import { refreshAllApprovedCreators, refreshCreator } from "@/app/actions";
import { Badge, Button, EmptyState, InlineNotice, Notice, PageHeader, Panel } from "@/components/ui";
import { readFeedback } from "@/lib/feedback";
import { formatBigInt, formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";

export default async function WatchlistPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const feedback = readFeedback(await searchParams);
  const prisma = getPrisma();
  const [creators, apiLogs] = await Promise.all([
    prisma.creator.findMany({
      where: { status: "approved" },
      orderBy: { updatedAt: "desc" },
      include: {
        accounts: true,
        _count: { select: { contentItems: true } }
      }
    }),
    prisma.apiRunLog.findMany({
      where: { service: "youtube" },
      orderBy: { startedAt: "desc" },
      take: 10
    })
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Creator watchlist"
        description="Approved YouTube channels. Refreshing pulls channel metadata, uploads, video metadata, and metric snapshots through the YouTube API."
        action={
          creators.length > 0 ? (
            <form action={refreshAllApprovedCreators}>
              <Button>Refresh all</Button>
            </form>
          ) : null
        }
      />
      <Notice feedback={feedback} />

      {!process.env.YOUTUBE_API_KEY ? (
        <InlineNotice title="YouTube API key missing" tone="error">
          Refresh actions will fail until YOUTUBE_API_KEY is added to .env.local and the dev server is restarted.
        </InlineNotice>
      ) : null}

      <Panel>
        {creators.length === 0 ? (
          <EmptyState>
            No approved creators yet. Approve a discovery candidate first, then refresh the creator here to store channel and video evidence.
          </EmptyState>
        ) : (
          <div className="grid gap-3">
            {creators.map((creator) => {
              const account = creator.accounts[0];
              return (
                <div className="rounded-md border border-border bg-background p-4" key={creator.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link className="font-semibold hover:text-accent" href={`/creators/${creator.id}`}>
                          {creator.name}
                        </Link>
                        <Badge>{creator.layer}</Badge>
                        <Badge>{creator._count.contentItems} tracked videos</Badge>
                      </div>
                      <p className="mt-2 max-w-3xl text-sm text-muted">
                        {creator.description || account?.description || "No description stored."}
                      </p>
                      <div className="mt-3 grid gap-1 text-xs text-muted sm:grid-cols-3">
                        <span>Subscribers: {formatBigInt(account?.subscriberCount)}</span>
                        <span>Channel videos: {account?.videoCount ?? "unknown"}</span>
                        <span>Last fetched: {formatDate(account?.fetchedAt)}</span>
                      </div>
                    </div>
                    <form action={refreshCreator}>
                      <input name="creatorId" type="hidden" value={creator.id} />
                      <input name="redirectTo" type="hidden" value="/watchlist" />
                      <Button tone="secondary">Refresh this creator</Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel>
        <h3 className="font-semibold">Recent YouTube API logs</h3>
        <p className="mt-1 text-sm text-muted">
          Use this after refresh to confirm which YouTube calls succeeded or failed.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="py-2 pr-3">Endpoint</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Cost</th>
                <th className="py-2 pr-3">Started</th>
                <th className="py-2 pr-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {apiLogs.map((log) => (
                <tr className="border-t border-border" key={log.id}>
                  <td className="py-3 pr-3">{log.endpoint}</td>
                  <td className="py-3 pr-3">{log.status}</td>
                  <td className="py-3 pr-3">{log.quotaCost}</td>
                  <td className="py-3 pr-3">{formatDate(log.startedAt)}</td>
                  <td className="py-3 pr-3 text-danger">{log.errorMessage ?? ""}</td>
                </tr>
              ))}
              {apiLogs.length === 0 ? (
                <tr>
                  <td className="py-4 text-muted" colSpan={5}>
                    No YouTube API logs yet. Refresh an approved creator to create the first channel, playlist, and video log entries.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
