import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
  js.configs.recommended,

  {
    ignores: ['node_modules/**', 'main.js'],
  },

  // Base config for all JS/TS files
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        module: 'writable',
        require: 'readonly',
        global: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      'unused-imports': unusedImports,
      react: react,
      'react-hooks': reactHooks,
      obsidianmd: obsidianmd,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // TypeScript rules
      ...typescript.configs['eslint-recommended'].rules,
      ...typescript.configs['recommended'].rules,

      // Custom rule overrides
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }],
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-function': 'off',

      // JavaScript rules
      'no-prototype-builtins': 'off',

      // Disable some recommended rules that conflict with TypeScript
      'no-undef': 'off',

      // React rules
      'react/react-in-jsx-scope': 'off',
      ...reactHooks.configs.recommended.rules,

      // Obsidian rules
      'obsidianmd/ui/sentence-case': 'error',
    },
  },

  // Type-checked rules for plugin source (requires parserOptions.project)
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/unbound-method': 'error',
    },
  },
];
