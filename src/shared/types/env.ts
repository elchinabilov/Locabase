/**
 * The root `.env` file, as the Secrets screen sees it.
 */

export interface EnvEntry {
  key: string
  /** fields with `secret: true` reach the UI masked */
  value: string
  masked: boolean
  /** the keys in `config.toml` that reference this variable */
  referencedBy: string[]
}
