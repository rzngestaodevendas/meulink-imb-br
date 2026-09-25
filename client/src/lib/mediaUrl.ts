export function mediaUrl(url: string | null | undefined, width: 480 | 960 | 1600): string {
  if (!url || !url.startsWith("/media/")) return url || "";
  return `${url}${url.includes("?") ? "&" : "?"}w=${width}`;
}
