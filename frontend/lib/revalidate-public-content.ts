/** Bust Next.js ISR for the public page after an admin content save. */
export async function revalidatePublicContent(type: string, slug?: string): Promise<void> {
  try {
    await fetch("/api/admin/revalidate-content", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ type, slug: slug?.trim() || undefined })
    });
  } catch {
    /* Course pages also fetch with cache: "no-store". */
  }
}
