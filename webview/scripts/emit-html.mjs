import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * 获取当前文件的绝对路径
 * 用于在 ES 模块中获取 __dirname 的等效值
 */
const __filename = fileURLToPath(import.meta.url);

/**
 * 获取当前文件所在目录的绝对路径
 * 用于构建相对路径和输出目录
 */
const __dirname = dirname(__filename);

/**
 * 输出目录的根路径
 * 指向 webview-dist 目录，这是构建后的文件输出位置
 */
const distRoot = resolve(__dirname, '..', '../webview-dist');

/**
 * 生成 HTML 模板
 *
 * 根据应用名称生成完整的 HTML 文档模板。
 * 包含必要的 meta 标签、样式表和脚本引用。
 *
 * @param appName 应用名称，用于标题和脚本路径
 * @returns 完整的 HTML 文档字符串
 */
const makeHtml = ({ appName }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CoReview ${appName}</title>
  <meta name="description" content="CoReview webview app" />
  <script type="module" crossorigin src="../shared/assets/vendor.js"></script>
  <script type="module" crossorigin src="../shared/assets/shared-common.js"></script>
  <link rel="stylesheet" crossorigin href="./assets/shared-common.css">
  <script type="module" crossorigin src="./assets/${appName.toLowerCase()}.js"></script>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;

/**
 * 目标应用配置列表
 *
 * 定义需要生成 HTML 文件的应用配置。
 * 每个配置包含输出目录和应用名称。
 */
const targets = [
  { dir: 'Sidebar', appName: 'Sidebar' },
  { dir: 'Editorial', appName: 'Editorial' },
];

/**
 * 主执行逻辑
 *
 * 遍历所有目标应用，为每个应用生成对应的 HTML 文件。
 * 确保输出目录存在，并写入生成的 HTML 内容。
 *
 * 执行流程：
 * 1. 遍历目标应用配置列表
 * 2. 为每个应用创建输出目录（如果不存在）
 * 3. 生成 HTML 文件并写入到对应目录
 */
for (const t of targets) {
  // 构建输出目录路径
  const outDir = resolve(distRoot, t.dir);

  // 创建输出目录，recursive: true 确保父目录也会被创建
  mkdirSync(outDir, { recursive: true });

  // 构建 HTML 文件的完整路径
  const htmlPath = resolve(outDir, 'index.html');

  // 生成 HTML 内容并写入文件
  writeFileSync(htmlPath, makeHtml({ appName: t.appName }), 'utf-8');
}

/**
 * 清理 Vite 产出的根 index.html 文件
 *
 * 移除 Vite 构建时在根目录生成的 index.html 文件。
 * 避免固定指向问题，确保使用动态生成的 HTML 文件。
 *
 * 执行流程：
 * 1. 尝试删除根目录的 index.html 文件
 * 2. 如果删除失败（文件不存在），忽略错误
 */
try {
  rmSync(resolve(distRoot, 'index.html'), { force: true });
} catch {
  // ignore
}
