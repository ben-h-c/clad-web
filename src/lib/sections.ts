/**
 * Section vocabulary, shared by the schema, masthead nav, and the
 * `/sections/[slug]` landing pages. The display name is what writers see
 * (and what's stored in frontmatter); the slug is what appears in URLs.
 */
export const SECTIONS = [
  "Politics",
  "Economy",
  "Science",
  "World",
  "Tech",
  "Misc",
] as const;

export type Section = (typeof SECTIONS)[number];

export function sectionSlug(section: string): string {
  return section.toLowerCase();
}

export function sectionFromSlug(slug: string): Section | null {
  const match = SECTIONS.find((s) => s.toLowerCase() === slug.toLowerCase());
  return match ?? null;
}
