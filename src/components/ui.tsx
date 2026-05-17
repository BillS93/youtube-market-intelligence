import type { ReactNode } from "react";

import type { Feedback } from "@/lib/feedback";

export function PageHeader({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <section className="rounded-lg border border-border bg-panel p-4">{children}</section>;
}

export function Notice({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) {
    return null;
  }

  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${noticeClass(feedback.status)}`}>
      <div className="font-medium">{feedback.message}</div>
      {feedback.detail ? <div className="mt-1">{feedback.detail}</div> : null}
    </div>
  );
}

export function InlineNotice({
  title,
  children,
  tone = "info"
}: {
  title: string;
  children: ReactNode;
  tone?: "success" | "error" | "info";
}) {
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${noticeClass(tone)}`}>
      <div className="font-medium">{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function Button({
  children,
  tone = "primary",
  type = "submit",
  disabled = false,
  onClick,
  formAction
}: {
  children: ReactNode;
  tone?: "primary" | "secondary" | "danger";
  type?: "submit" | "button";
  disabled?: boolean;
  onClick?: () => void;
  formAction?: string | ((formData: FormData) => void | Promise<void>);
}) {
  const toneClass =
    tone === "primary"
      ? "border-accent bg-accent text-white hover:bg-accent-strong"
      : tone === "danger"
        ? "border-danger bg-white text-danger hover:bg-red-50"
        : "border-border bg-background text-foreground hover:border-accent";

  return (
    <button
      className={`rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
      disabled={disabled}
      formAction={formAction}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-md border border-border bg-panel-muted px-2 py-1 text-xs text-muted">
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-background p-6 text-sm text-muted">
      {children}
    </div>
  );
}

export function Field({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent";

function noticeClass(tone: "success" | "error" | "info") {
  if (tone === "success") {
    return "border-accent bg-teal-50 text-accent-strong";
  }

  if (tone === "error") {
    return "border-danger bg-red-50 text-danger";
  }

  return "border-border bg-panel-muted text-foreground";
}
