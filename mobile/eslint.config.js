// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Règle propre au HTML : React Native affiche l'apostrophe telle quelle, et le français en est plein.
    rules: { 'react/no-unescaped-entities': 'off' },
  },
]);
