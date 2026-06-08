import js from '@eslint/js'
import globals from 'globals'
import vue from 'eslint-plugin-vue'

export default [
  {
    ignores: [
      'node_modules/**',
      'client/node_modules/**',
      'client/dist/**',
      'data/**',
    ],
  },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.js'],
    ignores: ['client/src/**', 'client/vite.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['client/src/**/*.{js,vue}', 'client/vite.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'error',
    },
  },
]
