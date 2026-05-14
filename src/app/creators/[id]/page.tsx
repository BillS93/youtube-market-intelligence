import { notFound } from "next/navigation";

import { refreshCreator } from "@/app/actions";
import { Badge, Button, PageHeader, Panel } from "@/components/ui";
import { formatBigInt, formatDate, formatNumber } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { parseJsonArray } from "@/lib/json";

export default async function CreatorDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const creator = await getPrisma().creator.findUnique({
    where: { id },
    include: {
      accounts: true,
      contentItems: {
        orderBy: { publishedAt: "desc" },
        include: {
          snapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
          scores: { orderBy: { scoredAt: "desc" }, take: 1 },
          audits: { orderBy: { createdAt: "desc" }, take: 1 }
        },
        take: 50
      }
    }
  });

  if (!creator) {
    notFound();
  }

  const account = creator.accounts[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={creator.name}
        description={creator.description ?? account?.description ?? "No description stored."}
        action={
          <form action={refreshCreator}>
            <input name="creatorId" type="hidden" value={creator.id} />
            <input name="redirectTo" type="hidden" value={`/creators/${creator.id}`} />
            <Button>Refresh creator</Button>
          </form>
        }
      />

      <section className="grid gap-4 md:grid-cols-4">
        <Panel>
          <div className="text-sm text-muted">Layer</div>
          <div className="mt-1 font-semibold">{creator.layer}</div>
        </Panel>
        <Panel>
          <div className="text-sm text-muted">Subscribers</div>
          <div className="mt-1 font-semibold">{formatBigInt(account?.subscriberCount)}</div>
        </Panel>
        <Panel>
          <div className="text-sm text-muted">Channel videos</div>
          <div className="mt-1 font-semibold">{account?.videoCount ?? "unknown"}</div>
        </Panel>
        <Panel>
          <div className="text-sm text-muted">Data expires</div>
          <div className="mt-1 font-semibold">{formatDate(account?.dataExpiresAt)}</div>
        </Panel>
      </section>

      <Panel>
        <h3 className="font-semibold">Recent tracked videos</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="py-2 pr-3">Title</th>
                <th className="py-2 pr-3">Format</th>
                <th className="py-2 pr-3">Views</th>
                <th className="py-2 pr-3">Over</th>
                <th className="py-2 pr-3">Flags</th>
                <th className="py-2 pr-3">Audit</th>
              </tr>
            </thead>
            <tbody>
              {creator.contentItems.map((item) => {
                const snapshot = item.snapshots[0];
                const score = item.scores[0];
                const audit = item.audits[0];
                return (
                  <tr className="border-t border-border" key={item.id}>
                    <td className="max-w-md py-3 pr-3">{item.title}</td>
                    <td className="py-3 pr-3">{item.formatType}</td>
                    <td className="py-3 pr-3">{formatBigInt(snapshot?.viewCount)}</td>
                    <td className="py-3 pr-3">{formatNumber(score?.overperformanceScore)}x</td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {parseJsonArray(score?.flags).map((flag) => (
                          <Badge key={flag}>{flag}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 pr-3">{audit ? `${Math.round(audit.confidenceScore * 100)}%` : "none"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
