import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';
import globals from 'globals';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_'
				}
			],
			'@typescript-eslint/no-explicit-any': 'warn',
			'no-empty': ['error', { allowEmptyCatch: true }],
			'svelte/no-at-html-tags': 'off',
			'svelte/require-each-key': 'warn',
			'svelte/no-dom-manipulating': 'off',
			'svelte/no-navigation-without-resolve': 'off',
			'svelte/prefer-svelte-reactivity': 'warn'
		}
	},
	{
		files: ['tests/**'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off'
		}
	},
	{
		ignores: ['.svelte-kit/', 'build/', 'node_modules/', 'drizzle/']
	}
);
