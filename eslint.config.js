// e-OIC ESLint flat config — encodes eTech Group TypeScript standards verbatim.
// Source of truth: Coding-Standards-master/TypeScript/.eslintrc.cjs
// (Coding-Standards-master.zip in the eTech Coding-Standards repo.)
//
// Do not deviate from these rules without explicit standards-owner approval.

import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import stylistic from '@stylistic/eslint-plugin';
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
            '@stylistic': stylistic,
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
            // DEVIATION from standards source: Coding-Standards-master/TypeScript/.eslintrc.cjs
            // declares `multiline: { delimiter: 'none', requireLast: false }`. The entire
            // e-OIC codebase (Plans A/B/C/D output) uses semicolon delimiters as the
            // de-facto convention, so Plan D Task 7 conforms the rule to existing code
            // rather than rewriting every interface. If a strict standards audit requires
            // alignment to `none`, that is a follow-up pass touching every TS interface.
            '@stylistic/member-delimiter-style': ['error', {
                multiline: { delimiter: 'semi', requireLast: true },
            }],
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

    // Scripts (Node ESM, TypeScript) — lints converted .mts scripts + the
    // vite config. Plan D Task 7 added this; the prior .js/.mjs blocks are
    // gone because no JS files remain anywhere in src/ or scripts/.
    {
        files: ['scripts/**/*.mts', '*.config.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                // No `project` here: scripts/*.mts and vite.config.ts already
                // typecheck under tsconfig.node.json via `npm run typecheck`.
                // Adding project here would force a second parse and risks
                // pulling transitive src/* files into the parser graph.
            },
            globals: { ...globals.node },
        },
        plugins: { '@typescript-eslint': tsPlugin },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            'no-console': 'off', // scripts may log
            // @typescript-eslint/no-unused-expressions extends the core rule and
            // reads its options object. Without either rule explicitly set, the
            // core rule's `allowShortCircuit` lookup is undefined and ESLint
            // crashes at parse time. Disabling both is necessary on this block.
            'no-unused-expressions': 'off',
            '@typescript-eslint/no-unused-expressions': 'off',
        },
    },
];
