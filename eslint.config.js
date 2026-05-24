import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/.vite/**',
      'tests/.e2e-variants/**',
      'tests/fixtures/**',
      'packages/create-tessera/templates/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // Svelte components author their <script lang="ts"> in TypeScript.
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      // LMS adapters deliberately swallow GetLastError/GetErrorString throws.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // `const engine = this` lets object-literal getters reach the class
      // instance's reactive private state.
      '@typescript-eslint/no-this-alias': [
        'error',
        { allowedNames: ['engine'] },
      ],
      // The runtime drives reactivity with explicit `version` counters and
      // reaches for SvelteMap/SvelteSet only where collection *contents* must
      // be reactive. The remaining plain Map/Set are local computation or
      // non-reactive bookkeeping, which this rule can't distinguish.
      'svelte/prefer-svelte-reactivity': 'off',
    },
  },

  // Type-aware linting is scoped to the shipped source the package tsconfigs
  // cover. The payoff is no-floating-promises: a dropped await on a SCORM/cmi5
  // commit is a silent tracking-corruption bug.
  {
    files: ['packages/*/src/**/*.ts'],
    ignores: ['**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },

  // console.* in the shipped runtime is a deliberate-or-not decision.
  {
    files: ['packages/tessera-learn/src/**/*.{ts,svelte}'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Tests and e2e specs mock SCORM/cmi5/xAPI globals, where `any` and empty
  // blocks are idiomatic, not the published surface.
  {
    files: ['**/tests/**', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': 'off',
      'preserve-caught-error': 'off',
    },
  },

  prettier,
);
