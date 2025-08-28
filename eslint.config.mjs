import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";

export default [
  // 通用 TS/JS 规则（扩展端 Node 环境 + webview 浏览器环境）
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
  },
  {
    plugins: {
      "@typescript-eslint": typescriptEslint,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      import: importPlugin,
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-duplicate-imports": "off",
      "import/no-duplicates": [
        "warn",
        { considerQueryString: true, "prefer-inline": true },
      ],
      // 交由 eslint-plugin-unused-imports 处理未使用导入/变量
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "import",
          format: ["camelCase", "PascalCase"],
        },
      ],
      curly: "warn",
      eqeqeq: "warn",
      "no-throw-literal": "warn",
      semi: "warn",
      // 使用 import/order 排序：第三方包 → 远（internal/绝对路径）→ 近（父级）→ 同级/索引 → 样式
      "import/order": [
        "warn",
        {
          groups: [
            ["builtin", "external"],
            ["internal"],
            ["parent"],
            ["sibling", "index"],
          ],
          pathGroups: [
            {
              pattern: "@shared/**",
              group: "internal",
              position: "after",
            },
            {
              pattern: "@/**",
              group: "internal",
              position: "after",
            },
            {
              pattern: "**/*.{css,scss,sass,less}",
              group: "index",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
          alphabetize: { order: "asc", caseInsensitive: true },
          "newlines-between": "never",
        },
      ],
    },
  },

  // webview 前端（浏览器 + React Hooks + Vite React Refresh）
  {
    files: ["webview/**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...reactHooks.configs["recommended-latest"].rules,
      ...reactRefresh.configs.vite.rules,
      // 强化 React Hooks 规则为 error 级别
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": [
        "error",
        {
          // 如有自定义 hook 需要纳入依赖推导，可在此追加：
          // e.g. "(useDebouncedCallback|useMemoizedFn)"
          additionalHooks: "",
        },
      ],
    },
  },

  // 测试文件（Mocha 全局）
  {
    files: ["src/test/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },
  },
];
