export type GeoLabelKind = "country" | "city";
export type GeoLabelRecord = {
  readonly id: string;
  readonly name: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly kind: GeoLabelKind;
  readonly rank: number;
  readonly population?: number;
  readonly capital?: boolean;
};

export type ProjectedGeoLabel = {
  readonly record: GeoLabelRecord;
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  readonly width: number;
  readonly height: number;
};

export type LabelZoom = "far" | "medium" | "close";

export function labelZoom(distance: number): LabelZoom {
  if (distance > 4.25) return "far";
  if (distance > 2.15) return "medium";
  return "close";
}

export function isLabelEligible(label: GeoLabelRecord, zoom: LabelZoom) {
  if (label.kind === "country") {
    const maxRank = zoom === "far" ? 2 : zoom === "medium" ? 4 : 6;
    return label.rank <= maxRank;
  }
  if (zoom === "far") return false;
  if (label.capital) return true;
  if (zoom === "medium") return label.rank <= 1;
  return label.rank <= 5;
}

function labelPriority(label: GeoLabelRecord) {
  if (label.kind === "country") return label.rank <= 3 ? 0 : 1;
  if (label.capital) return 2;
  return label.rank <= 2 ? 3 : 4;
}

export function labelOpacityForFacing(facing: number) {
  if (facing <= 0.015) return 0;
  const amount = Math.min(1, (facing - 0.015) / 0.18);
  return amount * amount * (3 - 2 * amount);
}

export function selectNonOverlappingLabels(
  candidates: readonly ProjectedGeoLabel[],
  width: number,
  height: number,
  limit = 64,
) {
  const ordered = [...candidates].sort((left, right) =>
    labelPriority(left.record) - labelPriority(right.record)
    || left.record.rank - right.record.rank
    || (right.record.population ?? 0) - (left.record.population ?? 0),
  );
  const accepted: ProjectedGeoLabel[] = [];

  for (const candidate of ordered) {
    if (accepted.length >= limit) break;
    const left = candidate.x - candidate.width / 2;
    const right = candidate.x + candidate.width / 2;
    const top = candidate.y - candidate.height / 2;
    const bottom = candidate.y + candidate.height / 2;
    if (right < 0 || left > width || bottom < 0 || top > height) continue;

    const overlaps = accepted.some((placed) =>
      Math.abs(candidate.x - placed.x) < (candidate.width + placed.width) / 2 + 4
      && Math.abs(candidate.y - placed.y) < (candidate.height + placed.height) / 2 + 3,
    );
    if (!overlaps) accepted.push(candidate);
  }

  return accepted;
}
