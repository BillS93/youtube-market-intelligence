import { runDiscovery } from "@/app/actions";
import { Button, Field, PageHeader, Panel, inputClass } from "@/components/ui";
import { getPrisma } from "@/lib/prisma";
import { getYoutubeQuotaStatus } from "@/lib/quota";
import { getNumberSetting } from "@/lib/settings";
import { formatDate } from "@/lib/format";

export default async function DiscoveryPage() {
  const prisma = getPrisma();
  const [defaultMaxResults, maxPages, quota, runs] = await Promise.all([
    getNumberSetting("YOUTUBE_DEFAULT_MAX_RESULTS"),
    getNumberSetting("YOUTUBE_MAX_DISCOVERY_PAGES"),
    getYoutubeQuotaStatus(100),
    prisma.discoveryQuery.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { candidates: true }
    })
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discovery"
        description="Run small YouTube API discovery jobs from seed queries. Channel search costs 100 quota units; optional video search adds another 100."
      />

      <Panel>
        <form action={runDiscovery} className="grid gap-4 md:grid-cols-2">
          <Field label="Seed query">
            <input
              className={inputClass}
              name="query"
              placeholder="MMA conditioning for fighters"
              required
            />
          </Field>
          <Field label="Sport layer">
            <select className={inputClass} name="layer" defaultValue="mma_specific">
              <option value="mma_specific">MMA-specific performance</option>
              <option value="combat_sport">Combat-sport performance</option>
              <option value="sport_performance">General sport performance</option>
              <option value="unknown">Unknown</option>
            </select>
          </Field>
          <Field label="Max results">
            <input
              className={inputClass}
              name="maxResults"
              type="number"
              min="1"
              max="50"
              defaultValue={defaultMaxResults}
            />
          </Field>
          <Field label="Max pages">
            <input
              className={inputClass}
              name="maxPages"
              type="number"
              min="1"
              max={maxPages}
              defaultValue="1"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input name="includeVideoSearch" type="checkbox" />
            Also search videos to discover their source channels
          </label>
          <div className="flex items-center gap-3 md:col-span-2">
            <Button>Run discovery</Button>
            <span className="text-sm text-muted">
              Quota used today: {quota.usedToday} / {quota.limit}
            </span>
          </div>
        </form>
      </Panel>

      <Panel>
        <h3 className="font-semibold">Recent discovery runs</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="py-2 pr-3">Query</th>
                <th className="py-2 pr-3">Layer</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Candidates</th>
                <th className="py-2 pr-3">Cost</th>
                <th className="py-2 pr-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr className="border-t border-border" key={run.id}>
                  <td className="py-3 pr-3">{run.query}</td>
                  <td className="py-3 pr-3">{run.layer}</td>
                  <td className="py-3 pr-3">{run.status}</td>
                  <td className="py-3 pr-3">{run.candidates.length}</td>
                  <td className="py-3 pr-3">{run.estimatedQuotaCost}</td>
                  <td className="py-3 pr-3">{formatDate(run.createdAt)}</td>
                </tr>
              ))}
              {runs.length === 0 ? (
                <tr>
                  <td className="py-4 text-muted" colSpan={6}>
                    No discovery runs yet.
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
