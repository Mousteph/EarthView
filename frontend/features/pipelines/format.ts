export function formatPipelineStakeholders(value: string | null): string | null {
  if (value === null) return null;
  const formatted = value
    .replace(/\s*\[\s*unknown\s*%\s*\]/gi, "")
    .replace(/\s*\[\s*(\d+(?:\.\d*)?)\s*%\s*\]/g, (_match, share: string) => {
      const percentage = share.endsWith(".") ? share.slice(0, -1) : share;
      return ` (${percentage}% ownership)`;
    })
    .replace(/^[;,]\s*|[;,]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return formatted || null;
}
