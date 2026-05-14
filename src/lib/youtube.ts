import { getPrisma } from "@/lib/prisma";
import { toJson } from "@/lib/json";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

type Fetcher = typeof fetch;

type ApiLogInput = {
  method: string;
  endpoint: string;
  query?: string;
  quotaCost: number;
  status: "success" | "error";
  requestMetadata?: Record<string, unknown>;
  responseMetadata?: Record<string, unknown>;
  errorMessage?: string;
  startedAt: Date;
  completedAt: Date;
};

type YoutubeClientOptions = {
  apiKey?: string;
  fetcher?: Fetcher;
  onLog?: (input: ApiLogInput) => Promise<void>;
};

export type YoutubeSearchItem = {
  kind: string;
  etag?: string;
  id: {
    kind?: string;
    channelId?: string;
    videoId?: string;
  };
  snippet: YoutubeSnippet;
};

export type YoutubeChannel = {
  kind: string;
  etag?: string;
  id: string;
  snippet: YoutubeSnippet & {
    customUrl?: string;
    country?: string;
    publishedAt?: string;
  };
  statistics?: {
    viewCount?: string;
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
    videoCount?: string;
  };
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string;
    };
  };
};

export type YoutubePlaylistItem = {
  kind: string;
  etag?: string;
  id: string;
  snippet: YoutubeSnippet & {
    channelId?: string;
    resourceId?: {
      kind?: string;
      videoId?: string;
    };
  };
  contentDetails?: {
    videoId?: string;
    videoPublishedAt?: string;
  };
};

export type YoutubeVideo = {
  kind: string;
  etag?: string;
  id: string;
  snippet: YoutubeSnippet & {
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
  };
  contentDetails?: {
    duration?: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
    favoriteCount?: string;
  };
};

export type YoutubeCommentThread = {
  kind: string;
  etag?: string;
  id: string;
  snippet?: Record<string, unknown>;
};

type YoutubeSnippet = {
  title?: string;
  description?: string;
  channelId?: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnails?: Record<string, { url?: string; width?: number; height?: number }>;
};

type YoutubeListResponse<T> = {
  kind?: string;
  etag?: string;
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo?: {
    totalResults?: number;
    resultsPerPage?: number;
  };
  items?: T[];
  error?: {
    code?: number;
    message?: string;
    errors?: unknown[];
  };
};

type YoutubeResult<T> = {
  items: T[];
  raw: YoutubeListResponse<T>;
  quotaCost: number;
};

export function createYoutubeClient(options: YoutubeClientOptions = {}) {
  const apiKey = options.apiKey ?? process.env.YOUTUBE_API_KEY;
  const fetcher = options.fetcher ?? fetch;

  async function request<T>(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined>,
    quotaCost: number
  ): Promise<YoutubeResult<T>> {
    if (typeof window !== "undefined") {
      throw new Error("The YouTube connector is server-side only.");
    }

    if (!apiKey) {
      throw new Error("Missing YOUTUBE_API_KEY. Add it to .env.local before calling YouTube.");
    }

    const startedAt = new Date();
    const url = new URL(`${YOUTUBE_API_BASE}/${endpoint}`);
    const safeParams: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
        safeParams[key] = value;
      }
    }

    url.searchParams.set("key", apiKey);
    let loggedFailure = false;

    try {
      const response = await fetcher(url, { cache: "no-store" });
      const raw = (await response.json()) as YoutubeListResponse<T>;
      const completedAt = new Date();

      if (!response.ok || raw.error) {
        const message = raw.error?.message ?? `YouTube API failed with ${response.status}`;
        await options.onLog?.({
          method: "GET",
          endpoint,
          query: typeof params.q === "string" ? params.q : undefined,
          quotaCost,
          status: "error",
          requestMetadata: safeParams,
          responseMetadata: {
            status: response.status,
            pageInfo: raw.pageInfo,
            error: raw.error
          },
          errorMessage: message,
          startedAt,
          completedAt
        });
        loggedFailure = true;
        throw new Error(message);
      }

      await options.onLog?.({
        method: "GET",
        endpoint,
        query: typeof params.q === "string" ? params.q : undefined,
        quotaCost,
        status: "success",
        requestMetadata: safeParams,
        responseMetadata: {
          status: response.status,
          pageInfo: raw.pageInfo,
          etag: raw.etag,
          nextPageToken: raw.nextPageToken
        },
        startedAt,
        completedAt
      });

      return { items: raw.items ?? [], raw, quotaCost };
    } catch (error) {
      const completedAt = new Date();
      if (!loggedFailure) {
        await options.onLog?.({
          method: "GET",
          endpoint,
          query: typeof params.q === "string" ? params.q : undefined,
          quotaCost,
          status: "error",
          requestMetadata: safeParams,
          errorMessage: error instanceof Error ? error.message : "Unknown YouTube API error",
          startedAt,
          completedAt
        });
      }
      throw error;
    }
  }

  return {
    async searchChannels(query: string, maxResults = 10) {
      return request<YoutubeSearchItem>(
        "search",
        {
          part: "snippet",
          type: "channel",
          q: query,
          maxResults: clampMaxResults(maxResults)
        },
        100
      );
    },

    async searchVideos(query: string, maxResults = 10) {
      return request<YoutubeSearchItem>(
        "search",
        {
          part: "snippet",
          type: "video",
          q: query,
          maxResults: clampMaxResults(maxResults)
        },
        100
      );
    },

    async getChannelById(channelId: string) {
      const result = await request<YoutubeChannel>(
        "channels",
        {
          part: "snippet,statistics,contentDetails",
          id: channelId,
          maxResults: 1
        },
        1
      );

      return result.items[0] ?? null;
    },

    async getChannelByHandle(handle: string) {
      const normalizedHandle = handle.startsWith("@") ? handle : `@${handle}`;
      const result = await request<YoutubeChannel>(
        "channels",
        {
          part: "snippet,statistics,contentDetails",
          forHandle: normalizedHandle,
          maxResults: 1
        },
        1
      );

      return result.items[0] ?? null;
    },

    async getUploadsPlaylist(channelId: string) {
      const channel = await this.getChannelById(channelId);
      return channel?.contentDetails?.relatedPlaylists?.uploads ?? null;
    },

    async listUploads(playlistId: string, maxPages = 1) {
      const allItems: YoutubePlaylistItem[] = [];
      let pageToken: string | undefined;
      let lastRaw: YoutubeListResponse<YoutubePlaylistItem> | null = null;
      const pages = Math.max(1, maxPages);

      for (let page = 0; page < pages; page += 1) {
        const result = await request<YoutubePlaylistItem>(
          "playlistItems",
          {
            part: "snippet,contentDetails",
            playlistId,
            maxResults: 50,
            pageToken
          },
          1
        );

        allItems.push(...result.items);
        lastRaw = result.raw;
        pageToken = result.raw.nextPageToken;

        if (!pageToken) {
          break;
        }
      }

      return {
        items: allItems,
        raw: lastRaw,
        quotaCost: pages
      };
    },

    async getVideos(videoIds: string[]) {
      const uniqueIds = [...new Set(videoIds)].filter(Boolean);
      const allItems: YoutubeVideo[] = [];
      let lastRaw: YoutubeListResponse<YoutubeVideo> | null = null;

      for (const batch of chunk(uniqueIds, 50)) {
        const result = await request<YoutubeVideo>(
          "videos",
          {
            part: "snippet,contentDetails,statistics",
            id: batch.join(","),
            maxResults: batch.length
          },
          1
        );
        allItems.push(...result.items);
        lastRaw = result.raw;
      }

      return {
        items: allItems,
        raw: lastRaw,
        quotaCost: Math.max(1, Math.ceil(uniqueIds.length / 50))
      };
    },

    async getCommentThreads(videoId: string, maxResults = 20) {
      return request<YoutubeCommentThread>(
        "commentThreads",
        {
          part: "snippet",
          videoId,
          maxResults: clampMaxResults(maxResults),
          textFormat: "plainText"
        },
        1
      );
    }
  };
}

export function getYoutubeClient(discoveryQueryId?: string) {
  return createYoutubeClient({
    onLog: async (input) => {
      await getPrisma().apiRunLog.create({
        data: {
          service: "youtube",
          method: input.method,
          endpoint: input.endpoint,
          query: input.query,
          quotaCost: input.quotaCost,
          status: input.status,
          requestMetadata: input.requestMetadata ? toJson(input.requestMetadata) : null,
          responseMetadata: input.responseMetadata ? toJson(input.responseMetadata) : null,
          errorMessage: input.errorMessage,
          startedAt: input.startedAt,
          completedAt: input.completedAt,
          discoveryQueryId
        }
      });
    }
  });
}

export async function searchChannels(query: string, maxResults = 10) {
  return getYoutubeClient().searchChannels(query, maxResults);
}

export async function searchVideos(query: string, maxResults = 10) {
  return getYoutubeClient().searchVideos(query, maxResults);
}

export async function getChannelById(channelId: string) {
  return getYoutubeClient().getChannelById(channelId);
}

export async function getChannelByHandle(handle: string) {
  return getYoutubeClient().getChannelByHandle(handle);
}

export async function getUploadsPlaylist(channelId: string) {
  return getYoutubeClient().getUploadsPlaylist(channelId);
}

export async function listUploads(playlistId: string, maxPages = 1) {
  return getYoutubeClient().listUploads(playlistId, maxPages);
}

export async function getVideos(videoIds: string[]) {
  return getYoutubeClient().getVideos(videoIds);
}

export async function getCommentThreads(videoId: string, maxResults = 20) {
  return getYoutubeClient().getCommentThreads(videoId, maxResults);
}

export function bestThumbnail(
  thumbnails: Record<string, { url?: string; width?: number; height?: number }> | undefined
) {
  if (!thumbnails) {
    return null;
  }

  return (
    thumbnails.maxres?.url ??
    thumbnails.high?.url ??
    thumbnails.medium?.url ??
    thumbnails.default?.url ??
    null
  );
}

export function parseOptionalBigInt(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function parseYoutubeDurationSeconds(duration: string | null | undefined) {
  if (!duration) {
    return null;
  }

  const match = duration.match(
    /^P(?:(?<days>\d+)D)?(?:T(?:(?<hours>\d+)H)?(?:(?<minutes>\d+)M)?(?:(?<seconds>\d+)S)?)?$/
  );

  if (!match?.groups) {
    return null;
  }

  const days = Number(match.groups.days ?? 0);
  const hours = Number(match.groups.hours ?? 0);
  const minutes = Number(match.groups.minutes ?? 0);
  const seconds = Number(match.groups.seconds ?? 0);

  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

export function inferFormatType(durationSeconds: number | null | undefined) {
  if (durationSeconds === null || durationSeconds === undefined) {
    return "unknown";
  }

  return durationSeconds <= 60 ? "short_candidate" : "long_form";
}

function clampMaxResults(maxResults: number) {
  return Math.max(1, Math.min(50, Math.floor(maxResults)));
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
