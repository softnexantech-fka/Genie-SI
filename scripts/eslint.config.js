import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'] || reactHooks.configs.recommended,
      reactRefresh.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // FIX v127 — Pattern élargi : ignore les vars commençant par _ (convention inutilisé),
      // les constantes UPPER_CASE, et les minuscules préfixées par underscore.
      // 'argsIgnorePattern' évite les erreurs sur les args de callbacks intentionnellement ignorés.
      'no-unused-vars': ['warn', {
        varsIgnorePattern: '^(_|[A-Z_])',
        argsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'no-empty': ['error', { 'allowEmptyCatch': true }],
    },
  },
  // Configuration spécifique pour les fichiers Node.js (API proxy, scripts)
  {
    files: ['api-proxy/**/*.js', 'api-proxy/*.js', 'scripts/**/*.js', 'generate-jwt-secret.js'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['warn', {
        varsIgnorePattern: '^(_|[A-Z_])',
        argsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'no-empty': ['error', { 'allowEmptyCatch': true }],
    },
  },
  // Configuration pour datastore.js qui utilise process.env
  {
    files: ['src/core/datastore.js'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['warn', {
        varsIgnorePattern: '^(_|[A-Z_])',
        argsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'no-empty': ['error', { 'allowEmptyCatch': true }],
    },
  },
])
