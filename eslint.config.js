import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const comun = {
  extends: [js.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
  languageOptions: {
    ecmaVersion: 2022,
    globals: globals.browser,
    parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
  },
}

export default defineConfig([
  globalIgnores(['dist', 'supabase/functions']),
  {
    ...comun,
    files: ['**/*.{js,jsx,mjs}'],
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    ...comun,
    files: ['**/*.{ts,tsx}'],
    extends: [...comun.extends, ...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
  {
    // Pruebas y scripts que corren en Node.
    files: ['**/*.test.mjs', 'scripts/**', 'supabase/tests/**'],
    languageOptions: { globals: globals.node },
  },
])
