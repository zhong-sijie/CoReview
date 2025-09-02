import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-plugin-prettier';
import globals from 'globals';

export default [
  // 通用 TS/JS 规则（扩展端 Node 环境 + webview 浏览器环境）
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
  },
  {
    plugins: {
      '@typescript-eslint': typescriptEslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      prettier: prettier,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-duplicate-imports': 'off',
      // 未使用变量检查
      'no-unused-vars': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },
      ],
      // 移除所有格式化相关规则，交由 Prettier 处理
      // 只保留代码质量相关的规则
      curly: 'warn',
      eqeqeq: 'warn',
      'no-throw-literal': 'warn',
      // Tailwind CSS 排序交由 Prettier 处理
      // Prettier 集成
      'prettier/prettier': 'error',
    },
  },

  // webview 前端（浏览器 + React Hooks + Vite React Refresh）
  {
    files: ['webview/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },

    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      ...reactRefresh.configs.vite.rules,
      // 强化 React Hooks 规则为 error 级别
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': [
        'error',
        {
          // 如有自定义 hook 需要纳入依赖推导，可在此追加：
          // e.g. "(useDebouncedCallback|useMemoizedFn)"
          additionalHooks: '',
        },
      ],
      // Prettier 集成
      'prettier/prettier': 'error',
    },
  },

  // 测试文件（Mocha 全局）
  {
    files: ['src/test/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },
    rules: {
      // Prettier 集成
      'prettier/prettier': 'error',
    },
  },
];
