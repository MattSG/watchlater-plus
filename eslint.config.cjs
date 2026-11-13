const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'output/**', 'dist/**', '.serena/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,cjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { eqeqeq: 'error', 'no-var': 'error', 'prefer-const': 'error' },
  },
  { files: ['content.js'], languageOptions: { globals: { WLP: 'readonly' } } },
];
