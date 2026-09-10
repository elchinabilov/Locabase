/**
 * Flat ESLint config.
 *
 * The rules that earn their place here are the ones that catch what review
 * misses: the react-hooks pair (a conditional hook and a wrong dependency array
 * were both live bugs in this repo before the linter existed), the
 * floating-promise rules for a codebase whose every action crosses an IPC
 * bridge, and the import boundary that keeps the renderer out of Node and
 * Electron main.
 *
 * Formatting is Prettier's job — `eslint-config-prettier` turns off everything
 * that would argue with it. The `stylistic` preset is deliberately left out for
 * the same reason: the codebase already has a consistent house style (`Array<T>`,
 * bracket access on index signatures), and a linter's job here is to catch bugs,
 * not to relitigate that.
 */
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import importPlugin from 'eslint-plugin-import'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist/**', 'out/**', 'node_modules/**', 'resources/**', '*.tsbuildinfo'] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: { import: importPlugin },
    rules: {
      // TypeScript already resolves every identifier, and it knows about the
      // build-time `define`s that ESLint cannot see.
      'no-undef': 'off',
      // `catch {}` is used deliberately in this codebase and every instance
      // carries a comment saying why; an empty block elsewhere is still a bug.
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-shadow': 'off',
      // `_` is the conventional throwaway; nested `Array.from` callbacks both use it.
      '@typescript-eslint/no-shadow': ['error', { allow: ['_'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      // Every action here crosses the IPC bridge. An unawaited rejection is a
      // silent failure with no UI feedback, which is exactly the bug class the
      // audit found eight times over.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } }
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' }
      ],
      '@typescript-eslint/require-await': 'off',
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'never'
        }
      ]
    }
  },

  /* ------------------------------------------------------------- renderer */
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Two rules from the React Compiler era are kept as warnings rather than
      // errors, deliberately:
      //
      // `refs` flags the latest-ref pattern (`ref.current = cb` during render),
      // which `sql-editor.tsx` and `lib/ipc.ts` use to keep a callback current
      // without re-running an effect. `useEffectEvent` is the replacement and
      // is not in stable React yet.
      //
      // `set-state-in-effect` flags the reset-on-change effects. They are worth
      // removing, but each one is a behaviour change that belongs in its own
      // commit rather than in a lint sweep.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      ...jsxA11y.flatConfigs.recommended.rules,
      // The app's dialogs open in response to a click and have one obvious
      // field; moving focus there is the accessible behaviour, not a violation.
      'jsx-a11y/no-autofocus': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // The renderer has no Node and no Electron: everything it needs arrives
      // over the bridge in `lib/ipc.ts`. Importing either would build, and then
      // fail at runtime behind `contextIsolation`.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'node:*', 'fs', 'path', 'child_process'],
              message: 'The renderer talks to main through `lib/ipc.ts`, not Node or Electron.'
            },
            {
              group: ['**/main/**'],
              message: 'Main-process code may not be imported by the renderer.'
            }
          ]
        }
      ]
    }
  },

  /* ----------------------------------------------------------------- main */
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
    rules: {
      // The main process has no DOM.
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'No DOM in the main process.' },
        { name: 'document', message: 'No DOM in the main process.' }
      ]
    }
  },

  /* ---------------------------------------------------------------- tests */
  {
    files: ['tests/**/*.ts'],
    rules: {
      // Tests deliberately construct malformed input and poke at internals.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off'
    }
  },

  /* --------------------------------------------------------------- config */
  {
    files: ['*.config.{ts,js,mjs}', 'scripts/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked
  },

  prettier
)
