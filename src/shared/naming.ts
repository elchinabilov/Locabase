/**
 * The `project_id` naming rule. This value is written into `config.toml` and
 * becomes the suffix of the docker container names (`supabase_db_<project_id>`),
 * so only lowercase letters, digits and `_ . -` are kept.
 */
export function sanitizeProjectId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
}
