export const formatCount = (count: number) => new Intl.NumberFormat("en-US").format(count);

export function formatEventTime(timestamp: number) {
  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium", timeStyle: "medium", timeZone: "UTC",
  }).format(new Date(timestamp))} UTC`;
}

export function formatCoordinates(latitude: number, longitude: number) {
  return `${Math.abs(latitude).toFixed(2)}° ${latitude >= 0 ? "N" : "S"}, ${Math.abs(longitude).toFixed(2)}° ${longitude >= 0 ? "E" : "W"}`;
}

