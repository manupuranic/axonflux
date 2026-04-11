const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrCompactFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat("en-IN");

export const formatInr = (v: number | null | undefined): string =>
  v == null ? "—" : inrFormatter.format(v);

export const formatInrCompact = (v: number | null | undefined): string =>
  v == null ? "—" : inrCompactFormatter.format(v);

export const formatQty = (v: number | null | undefined): string =>
  v == null ? "—" : numberFormatter.format(Math.round(v));

export const formatDays = (v: number | null | undefined): string =>
  v == null ? "—" : `${Math.round(v)}d`;

export const formatPercent = (v: number | null | undefined): string =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;
