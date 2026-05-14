export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "unknown";
  }

  return new Intl.NumberFormat("en", {
    maximumFractionDigits: value >= 10 ? 0 : 2
  }).format(value);
}

export function formatBigInt(value: bigint | number | null | undefined) {
  if (value === null || value === undefined) {
    return "unknown";
  }

  return new Intl.NumberFormat("en").format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "unknown";
  }

  return `${Math.round(value * 100)}%`;
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium"
  }).format(new Date(value));
}
