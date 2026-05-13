// e-OIC ESLint flat config — encodes eTech Group TypeScript standards verbatim.
// Source of truth: Coding-Standards-master/TypeScript/.eslintrc.cjs
// (Coding-Standards-master.zip in the eTech Coding-Standards repo.)
//
// Do not deviate from these rules without explicit standards-owner approval.

import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import noAutofix from 'eslint-plugin-no-autofix';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
});

export default [
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'public/service-worker.js',
            'coverage/**',
        ],
    },

    // Airbnb base (via FlatCompat) — applied to all TS/TSX
    ...compat.extends('airbnb', 'airbnb/hooks', 'airbnb-typescript').map((c) => ({
        ...c,
        files: ['src/**/*.{ts,tsx}'],
    })),

    // Disable stylistic @typescript-eslint rules removed in v8 (moved to @stylistic).
    // airbnb-typescript@18 still references them; without this they crash config load.
    // Standards-relevant equivalents (indent, semi, etc.) are re-asserted below.
    {
        files: ['src/**/*.{ts,tsx}'],
        rules: {
            '@typescript-eslint/brace-style': 'off',
            '@typescript-eslint/comma-dangle': 'off',
            '@typescript-eslint/comma-spacing': 'off',
            '@typescript-eslint/func-call-spacing': 'off',
            '@typescript-eslint/indent': 'off',
            '@typescript-eslint/keyword-spacing': 'off',
            '@typescript-eslint/lines-between-class-members': 'off',
            '@typescript-eslint/no-extra-parens': 'off',
            '@typescript-eslint/no-extra-semi': 'off',
            '@typescript-eslint/no-throw-literal': 'off',
            '@typescript-eslint/object-curly-spacing': 'off',
            '@typescript-eslint/quotes': 'off',
            '@typescript-eslint/semi': 'off',
            '@typescript-eslint/space-before-blocks': 'off',
            '@typescript-eslint/space-before-function-paren': 'off',
            '@typescript-eslint/space-infix-ops': 'off',
        },
    },

    // TypeScript + React rules
    {
        files: ['src/**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                project: './tsconfig.json',
                tsconfigRootDir: __dirname,
                ecmaFeatures: { jsx: true },
            },
            globals: {
                ...globals.browser,
                ...globals.es2024,
                __BUILD_VERSION__: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            react,
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
            'jsx-a11y': jsxA11y,
            import: importPlugin,
            'no-autofix': noAutofix,
        },
        settings: {
            react: { version: 'detect' },
            'import/resolver': {
                typescript: { project: './tsconfig.json' },
                node: true,
            },
        },
        rules: {
            // From plugin:react/jsx-runtime
            ...react.configs['jsx-runtime'].rules,
            // From plugin:jsx-a11y/recommended
            ...jsxA11y.configs.recommended.rules,
            // From plugin:@typescript-eslint/recommended
            ...tsPlugin.configs.recommended.rules,
            // From plugin:react-hooks/recommended
            ...reactHooks.configs.recommended.rules,

            // Verbatim from Coding-Standards-master/TypeScript/.eslintrc.cjs:
            'arrow-body-style': ['off', 'always'],
            semi: ['error', 'always'],
            indent: ['error', 4],
            'no-console': ['error', { allow: ['warn', 'error', 'trace'] }],
            'comma-dangle': 'off',
            'linebreak-style': 'off',
            'class-methods-use-this': 'off',
            'lines-between-class-members': 'off',
            'max-depth': ['error', 2],
            'no-shadow': 'off',
            'object-curly-newline': ['error', {
                ObjectExpression: { multiline: true, minProperties: 3 },
                ObjectPattern: { multiline: true, minProperties: 4 },
                ImportDeclaration: 'never',
                ExportDeclaration: { multiline: true, minProperties: 3 },
            }],
            'react/function-component-definition': [2, {
                namedComponents: 'arrow-function',
                unnamedComponents: 'function-expression',
            }],
            'import/extensions': ['error', 'never', { json: 'always' }],
            'import/no-unresolved': 'off',
            'react/no-unescaped-entities': 'off',
            'react/destructuring-assignment': 'off',
            'react/jsx-indent': 'off',
            'react/jsx-indent-props': ['error', 4],
            'react/jsx-filename-extension': [1, { extensions: ['.ts', '.tsx'] }],
            'react/require-default-props': 'off',
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            'max-len': 'off',
            'no-nested-ternary': 'off',
            'nonblock-statement-body-position': 'off',
            curly: 'off',
            '@typescript-eslint/no-shadow': 'error',
            // NOTE: `@typescript-eslint/member-delimiter-style` from the standards source is
            // intentionally omitted here — the rule was moved from @typescript-eslint to
            // @stylistic/eslint-plugin in @typescript-eslint v8 (installed in Task 2).
            // Re-enable in Plan D once @stylistic/eslint-plugin is added.
            '@typescript-eslint/naming-convention': [
                'error',
                {
                    selector: 'interface',
                    format: ['PascalCase'],
                    custom: { regex: '^I[A-Z]', match: true },
                },
            ],
        },
    },

    // Lint existing JS during the transition — Plan C/D rename files; this block
    // is removed in Plan D's final commit when no .js/.jsx remains.
    {
        files: ['src/**/*.{js,jsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: {
                ...globals.browser,
                ...globals.es2024,
                __BUILD_VERSION__: 'readonly',
            },
        },
        plugins: { react, 'react-hooks': reactHooks },
        settings: { react: { version: 'detect' } },
        rules: {
            ...react.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },

    // Scripts (Node ESM) — JS for now; .mts equivalents are created in Plan D
    {
        files: ['scripts/**/*.{js,mjs}', '*.config.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node },
        },
    },

    // JS tests — same shape as src/ JS during transition
    {
        files: ['src/lib/*.test.js'],
        languageOptions: {
            globals: { ...globals.node, ...globals.browser },
        },
    },
];
