export type Feedback = {
  status: "success" | "error" | "info";
  message: string;
  detail?: string;
};

type SearchParams = Record<string, string | string[] | undefined> | undefined;

export function feedbackUrl(path: string, feedback: Feedback) {
  const params = new URLSearchParams();
  params.set("status", feedback.status);
  params.set("message", feedback.message);

  if (feedback.detail) {
    params.set("detail", feedback.detail);
  }

  return `${path}?${params.toString()}`;
}

export function readFeedback(searchParams: SearchParams): Feedback | null {
  const status = single(searchParams?.status);
  const message = single(searchParams?.message);
  const detail = single(searchParams?.detail);

  if (
    (status === "success" || status === "error" || status === "info") &&
    message
  ) {
    return { status, message, detail };
  }

  return null;
}

export function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "The action failed. Check the API logs for details.";
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
