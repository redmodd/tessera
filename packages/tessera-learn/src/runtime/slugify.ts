/**
 * Slugify a string for use as a URL-safe / filename-safe identifier.
 * "My Course Title" → "my-course-title"
 *
 * Shared by the runtime (`WebAdapter` localStorage key) and the build-time
 * exporter (`runExport` zip filename). Both want identical, deterministic
 * output so a course's storage key matches its package name.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
