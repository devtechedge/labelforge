export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "Not yet";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "Not yet";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export function formatRelative(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60_000) return formatter.format(Math.round(diff / 1000), "second");
  if (abs < 3_600_000) return formatter.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return formatter.format(Math.round(diff / 3_600_000), "hour");
  return formatter.format(Math.round(diff / 86_400_000), "day");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPercent(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) return "Not available";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatMetric(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "Not available";
  return value.toFixed(3);
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1)}...`;
}
