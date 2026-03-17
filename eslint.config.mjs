import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';

export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**", "build/**", "eslint.config.mjs", "esbuild.config.mjs", "version-bump.mjs", "src/core/clip-server/**", "src/core/publish-server/**", "main.js", "manifest.json", "styles.css"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      obsidianmd
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // 暂时禁用大小写检查和 any 类型检查
      'obsidianmd/ui/sentence-case': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-prototype-builtins': 'off'
    }
  }
);