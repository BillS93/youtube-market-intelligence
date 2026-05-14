import Link from "next/link";

import { refreshAllApprovedCreators, refreshCreator } from "@/app/actions";
import { Badge, Button, EmptyState, PageHeader, Panel } from "@/components/ui";
import { getPrisma } from "@/lib/prisma";
import { formatBigInt, formatDate } from "@/lib/format";

export default async function WatchlistPage() {
  const creators = await getPrisma().creator.findMany({
    where: { status: "approved" },
    orderBy: { updatedAt: "desc" },
    include: {
      accounts: true,
      _count: { select: { contentItems: true } }
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Creator watchlist"
        description="Approved YouTube channels. Refreshing pulls channel metadata, uploads, video metadata, and metric snapshots through the YouTube API."
        action={
          <form action={refreshAllApprovedCreators}>
            <Button>Refresh all</Button>
          </form>
        }
      />

      <Panel>
        {creators.length === 0 ? (
          <EmptyState>No approved creators yet.</EmptyState>
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
                        <Badge>{creator._count.contentItems} videos</Badge>
                      </div>
                      <p className="mt-2 max-w-3xl text-sm text-muted">
                        {creator.description || account?.description || "No description stored."}
                      </p>
                      <div className="mt-3 grid gap-1 text-xs text-muted sm:grid-cols-3">
                        <span>Subscribers: {formatBigInt(account?.subscriberCount)}</span>
                        <span>Videos: {account?.videoCount ?? "unknown"}</span>
                        <span>Fetched: {formatDate(account?.fetchedAt)}</span>
                      </div>
                    </div>
                    <form action={refreshCreator}>
                      <input name="creatorId" type="hidden" value={creator.id} />
                      <input name="redirectTo" type="hidden" value="/watchlist" />
                      <Button tone="secondary">Refresh</Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
