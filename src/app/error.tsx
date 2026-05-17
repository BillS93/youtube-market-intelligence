"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border border-danger bg-red-50 p-4 text-danger">
      <h2 className="text-xl font-semibold">This page could not load.</h2>
      <p className="mt-2 text-sm">
        {error.message || "Check your local setup, API keys, and database connection, then try again."}
      </p>
      <div className="mt-4">
        <Button tone="danger" type="button" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
