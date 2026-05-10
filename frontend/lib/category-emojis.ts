/** Visual cue for category pills (matches Sarveda merchandising groupings). */
export function categoryEmoji(slug: string): string {
  const s = slug.toLowerCase();
  if (s.includes("sound") || s.includes("music") || s.includes("instrument")) {
    return "🎵";
  }
  if (s.includes("yoga") || s.includes("meditation")) {
    return "🧘";
  }
  if (s.includes("ayurveda") || s.includes("herb")) {
    return "🌿";
  }
  if (s.includes("eco") || s.includes("sustain")) {
    return "🌍";
  }
  if (s.includes("personal") || s.includes("care") || s.includes("skin")) {
    return "✨";
  }
  return "🪷";
}
