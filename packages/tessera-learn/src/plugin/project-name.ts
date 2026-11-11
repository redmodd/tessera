// Pure, dependency-free helpers shared by the `tessera new` subcommand, the
// `create-tessera` scaffolder and the manifest's default titles. Kept
// import-free so create-tessera can bundle it at build time without dragging
// in the rest of the plugin (vite, svelte, …).

// npm package name rules: 1-214 chars, lowercase, must start with [a-z0-9],
// allowed chars [a-z0-9._-], no leading dot or underscore.
export function validateProjectName(
  name: string,
  label = 'Project name',
): string | null {
  if (!name) return `${label} is required`;
  if (name.length > 214) return `${label} must be 214 characters or fewer`;
  if (name !== name.toLowerCase()) return `${label} must be lowercase`;
  if (!/^[a-z0-9]/.test(name)) {
    return `${label} must start with a letter or digit`;
  }
  if (!/^[a-z0-9._-]+$/.test(name)) {
    return `${label} may only contain lowercase letters, digits, "-", "_", and "."`;
  }
  return null;
}

/** Title-case a slug on "-" and "_", so "v1.2-intro" stays "V1.2 Intro". */
export function toTitleCase(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
