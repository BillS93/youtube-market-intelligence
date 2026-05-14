import { describe, expect, it, vi } from "vitest";

import { createYoutubeClient, parseYoutubeDurationSeconds } from "@/lib/youtube";

describe("YouTube connector", () => {
  it("calls search.list for channel discovery and logs without the API key", async () => {
    const logs: unknown[] = [];
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: { channelId: "UC123" },
              snippet: { title: "Coach", description: "MMA strength" }
            }
          ],
          pageInfo: { totalResults: 1, resultsPerPage: 1 }
        }),
        { status: 200 }
      )
    );

    const client = createYoutubeClient({
      apiKey: "secret-key",
      fetcher: fetchMock as unknown as typeof fetch,
      onLog: async (input) => {
        logs.push(input);
      }
    });

    const result = await client.searchChannels("mma conditioning", 5);
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const url = firstCall![0] as URL;

    expect(url.searchParams.get("part")).toBe("snippet");
    expect(url.searchParams.get("type")).toBe("channel");
    expect(url.searchParams.get("q")).toBe("mma conditioning");
    expect(url.searchParams.get("key")).toBe("secret-key");
    expect(result.items[0].id.channelId).toBe("UC123");
    expect(JSON.stringify(logs)).not.toContain("secret-key");
  });

  it("batches videos.list requests in groups of 50 IDs", async () => {
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, _init?: RequestInit) =>
      new Response(JSON.stringify({ items: [] }), {
        status: 200
      })
    );
    const client = createYoutubeClient({ apiKey: "key", fetcher: fetchMock as unknown as typeof fetch });

    await client.getVideos(Array.from({ length: 51 }, (_, index) => `video-${index}`));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws and logs failed YouTube responses", async () => {
    const logs: { status: string; errorMessage?: string }[] = [];
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, _init?: RequestInit) =>
      new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
        status: 403
      })
    );
    const client = createYoutubeClient({
      apiKey: "key",
      fetcher: fetchMock as unknown as typeof fetch,
      onLog: async (input) => {
        logs.push({ status: input.status, errorMessage: input.errorMessage });
      }
    });

    await expect(client.searchVideos("mma", 1)).rejects.toThrow("quota exceeded");
    expect(logs).toHaveLength(1);
    expect(logs.some((log) => log.status === "error" && log.errorMessage === "quota exceeded")).toBe(true);
  });

  it("parses ISO 8601 YouTube durations", () => {
    expect(parseYoutubeDurationSeconds("PT1H2M3S")).toBe(3723);
    expect(parseYoutubeDurationSeconds("PT45S")).toBe(45);
  });
});
