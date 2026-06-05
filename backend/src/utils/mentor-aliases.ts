/** Known duplicate mentor names — any alias resolves to the same person. */
export const MENTOR_ALIAS_GROUPS: string[][] = [
  ["Sunithi", "Sunithi Ramesh", "Sunithi S. Ramesh"],
  ["Karthik", "Karthik CM"],
  ["Arjun", "Arjun Arora"]
];

export function normalizeMentorNameKey(name: string): string {
  return name
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function aliasGroupForName(name: string): string[] | null {
  const key = normalizeMentorNameKey(name);
  for (const group of MENTOR_ALIAS_GROUPS) {
    if (group.some((alias) => normalizeMentorNameKey(alias) === key)) {
      return group;
    }
  }
  return null;
}

export function namesMatchMentorAlias(a: string, b: string): boolean {
  const keyA = normalizeMentorNameKey(a);
  const keyB = normalizeMentorNameKey(b);
  if (keyA === keyB) return true;
  const groupA = aliasGroupForName(a);
  const groupB = aliasGroupForName(b);
  if (groupA && groupB) {
    const keysB = new Set(groupB.map(normalizeMentorNameKey));
    return groupA.some((alias) => keysB.has(normalizeMentorNameKey(alias)));
  }
  return false;
}

export type MentorRichnessInput = {
  name: string;
  bio?: string | null;
  photoUrl?: string | null;
  expertise?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

export function mentorDataScore(row: MentorRichnessInput): number {
  let score = 0;
  if (row.bio?.trim()) score += Math.min(row.bio.trim().length, 2000);
  if (row.photoUrl?.trim()) score += 500;
  if (row.expertise?.trim()) score += 100;
  if (row.seoTitle?.trim()) score += 50;
  if (row.seoDescription?.trim()) score += 50;
  score += row.name.trim().length;
  return score;
}

export function pickRichestMentor<T extends MentorRichnessInput>(rows: T[]): T {
  return rows.reduce((best, row) =>
    mentorDataScore(row) > mentorDataScore(best) ? row : best
  );
}
