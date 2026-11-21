// Configuration ESLint (format « flat ») : règles recommandées de JavaScript et de typescript-eslint.
const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  { ignores: ['node_modules/', 'out/', 'dist/', 'release/', 'build/installer/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{js,cjs,mjs,ts,mts,cts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Les textes en français contiennent des espaces insécables (avant « : », dans « … ») : seules celles du code
      // lui-même sont signalées.
      'no-irregular-whitespace': ['error', { skipStrings: true, skipComments: true, skipRegExps: true, skipTemplates: true }],
      // Les expressions qui retirent les caractères de contrôle d'un texte les nomment exprès.
      'no-control-regex': 'off',
      // Un nom commençant par « _ » marque une valeur ignorée volontairement (déstructuration, paramètre imposé).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Les tests lisent des fichiers JSON de CurseForge sans en décrire tout le format.
    files: ['test/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['eslint.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
