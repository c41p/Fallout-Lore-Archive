import { statusLabel } from "../lib/format";

export function StatusBadge({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{statusLabel(value)}</span>;
}
