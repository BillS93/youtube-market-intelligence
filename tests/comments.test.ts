import { describe, expect, it, vi } from "vitest";

import { classifyCommentError } from "@/lib/jobs";
import { createYoutubeClient } from "@/lib/youtube";

describe("comment collection helpers", () => {
  it("classifies commentsDisabled errors without crashing the whole analysis", () => {
    expect(classifyCommentError(new Error("commentsDisabled"))).toBe("commentsDisabled");
  });

  it("calls commentThreads.list with relevance order and plain text", async () => {
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, _init?: RequestInit) =>
      new Response(JSON.stringify({ items: [] }), { status: 200 })
    );
    const client = createYoutubeClient({ apiKey: "key", fetcher: fetchMock as unknown as typeof fetch });

    await client.getCommentThreads("video-1", 25, "relevance");

    const url = fetchMock.mock.calls[0]![0] as URL;
    expect(url.searchParams.get("order")).toBe("relevance");
    expect(url.searchParams.get("textFormat")).toBe("plainText");
    expect(url.searchParams.get("maxResults")).toBe("25");
  });
});
