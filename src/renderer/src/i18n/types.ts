/**
 * i18n types. `Dict` is the shape of the source language (AZ) — every
 * translation has to have the same shape, and TypeScript reports it at build
 * time when one doesn't.
 */
export type Dict = { [key: string]: string | Dict }

/**
 * A dotted key like `a.b.c` — enumerates every leaf of `D`.
 *
 * NOTE: there is no `D extends Dict` constraint here — `Dict`'s index signature
 * would collapse `keyof` to `string` and lose every literal key. `D` is left
 * unconstrained, so for concrete (`as const`) object types like `typeof az`,
 * `keyof` returns the proper literal union.
 */
export type Keys<D> = D extends string
  ? never
  : {
      [K in keyof D & string]: D[K] extends string ? K : `${K}.${Keys<D[K]>}`
    }[keyof D & string]
