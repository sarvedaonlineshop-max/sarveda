export type VideoSource =
  | { type: "youtube"; id: string; embedUrl: string; thumbnailUrl: string }
  | { type: "vimeo"; id: string; embedUrl: string; thumbnailUrl: null }
  | { type: "file"; url: string };

function youtubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function vimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m?.[1] ?? null;
}

/** Classify a video URL so we can embed hosted players (YouTube/Vimeo) or play files directly. */
export function parseVideoSource(url: string): VideoSource {
  const trimmed = url.trim();
  const yt = youtubeId(trimmed);
  if (yt) {
    return {
      type: "youtube",
      id: yt,
      embedUrl: `https://www.youtube.com/embed/${yt}?rel=0`,
      thumbnailUrl: `https://img.youtube.com/vi/${yt}/hqdefault.jpg`
    };
  }
  const vm = vimeoId(trimmed);
  if (vm) {
    return {
      type: "vimeo",
      id: vm,
      embedUrl: `https://player.vimeo.com/video/${vm}`,
      thumbnailUrl: null
    };
  }
  return { type: "file", url: trimmed };
}
