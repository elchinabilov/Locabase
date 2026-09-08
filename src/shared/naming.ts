/**
 * `project_id` adlandırma qaydası. Bu dəyər `config.toml`-a yazılır və docker
 * konteyner adlarının şəkilçisi olur (`supabase_db_<project_id>`), ona görə
 * yalnız kiçik hərf, rəqəm və `_ . -` saxlanılır.
 */
export function sanitizeProjectId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
}
