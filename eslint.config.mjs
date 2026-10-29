import obsidian from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

// Mirrors the Obsidian marketplace review bot config so a failing rule is caught
// locally instead of in the release scan.
export default [
	{
		ignores: ['main.js', 'node_modules/', 'cli/', 'test/']
	},
	...obsidian.configs.recommended,
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: obsidian.ruleConfigs.recommendedTypeChecked
	}
];
