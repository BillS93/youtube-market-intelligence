import { purgeOrRefreshExpiredYoutubeData, saveSettings } from "@/app/actions";
import {
  Button,
  Field,
  Notice,
  PageHeader,
  Panel,
  inputClass
} from "@/components/ui";
import { readFeedback } from "@/lib/feedback";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { getYoutubeQuotaStatus } from "@/lib/quota";
import { listSettings } from "@/lib/settings";

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const feedback = readFeedback(await searchParams);
  const envStatus = [
    {
      label: "YOUTUBE_API_KEY",
      detected: Boolean(process.env.YOUTUBE_API_KEY),
      detail: process.env.YOUTUBE_API_KEY
        ? "Detected server-side. Discovery and refresh can call YouTube."
        : "Missing. Add it to .env.local and restart the dev server before discovery or refresh."
    },
    {
      label: "OPENAI_API_KEY",
      detected: Boolean(process.env.OPENAI_API_KEY),
      detail: process.env.OPENAI_API_KEY
        ? "Detected server-side. AI audits can run."
        : "Missing. AI audits will refuse to run until this is configured."
    },
    {
      label: "DATABASE_URL",
      detected: Boolean(process.env.DATABASE_URL),
      detail: process.env.DATABASE_URL
        ? "Detected server-side. The database connection value is not shown in the browser."
        : "Missing. The app falls back to file:./dev.db for local development."
    }
  ];
  const [settings, quota, apiLogs] = await Promise.all([
    listSettings(),
    getYoutubeQuotaStatus(),
    getPrisma().apiRunLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 20
    })
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings and API status"
        description="Local guardrails for YouTube quota, data retention, and scoring thresholds."
      />
      <Notice feedback={feedback} />

      <section className="grid gap-4 md:grid-cols-4">
        {envStatus.map((item) => (
          <Panel key={item.label}>
            <div className="text-sm text-muted">{item.label}</div>
            <div className={`mt-1 font-semibold ${item.detected ? "text-accent-strong" : "text-danger"}`}>
              {item.detected ? "Detected" : "Missing"}
            </div>
            <p className="mt-2 text-xs text-muted">{item.detail}</p>
          </Panel>
        ))}
        <Panel>
          <div className="text-sm text-muted">YouTube quota today</div>
          <div className="mt-1 font-semibold">
            {quota.usedToday} / {quota.limit}
          </div>
        </Panel>
      </section>

      <Panel>
        <form action={saveSettings} className="grid gap-4 md:grid-cols-2">
          {settings.map((setting) => (
            <Field label={setting.key} key={setting.key}>
              <input className={inputClass} name={setting.key} defaultValue={setting.value} />
            </Field>
          ))}
          <div className="md:col-span-2">
            <Button>Save settings</Button>
          </div>
        </form>
      </Panel>

      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">YouTube data retention</h3>
            <p className="mt-1 text-sm text-muted">
              Refreshes expired approved creators, clears expired raw payloads, and removes unreferenced expired snapshots.
            </p>
          </div>
          <form action={purgeOrRefreshExpiredYoutubeData}>
            <Button tone="secondary">Run refresh/purge</Button>
          </form>
        </div>
      </Panel>

      <Panel>
        <h3 className="font-semibold">Recent API run logs</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="py-2 pr-3">Service</th>
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
                  <td className="py-3 pr-3">{log.service}</td>
                  <td className="py-3 pr-3">{log.endpoint}</td>
                  <td className="py-3 pr-3">{log.status}</td>
                  <td className="py-3 pr-3">{log.quotaCost}</td>
                  <td className="py-3 pr-3">{formatDate(log.startedAt)}</td>
                  <td className="py-3 pr-3">{log.errorMessage ?? ""}</td>
                </tr>
              ))}
              {apiLogs.length === 0 ? (
                <tr>
                  <td className="py-4 text-muted" colSpan={6}>
                    No API calls have been logged yet. Run discovery or refresh a creator to create the first log.
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
