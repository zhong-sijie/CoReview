import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { type UserConfigExport, defineConfig } from 'vite';

export interface CreateAppConfigOptions {
  appRootDir: string; // e.g. "Sidebar" or "Editorial"
  outDirName: string; // e.g. "Sidebar" or "Editorial"
  devPort: number;
}

export function createAppConfig(
  options: CreateAppConfigOptions,
): UserConfigExport {
  const { appRootDir, outDirName, devPort } = options;
  return defineConfig({
    // 使用 webview 根目录作为 Vite root，仅维护一个公共 index.html
    root: resolve(__dirname, '.'),
    plugins: [react()],
    base: './',
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '../shared'),
        '@common': resolve(__dirname, 'common'),
        // 每个子应用在构建时将 app-component 指向其 App 组件
        'app-component': resolve(__dirname, `${appRootDir}/App.tsx`),
      },
    },
    build: {
      // 所有构建产物输出到统一根目录，便于共享 vendor 复用
      outDir: resolve(__dirname, '../webview-dist'),
      // 多 app 顺序构建时不能清空整个输出目录
      emptyOutDir: false,
      // 更激进的体积优化
      target: 'es2020',
      cssMinify: true,
      minify: 'esbuild',
      sourcemap: false,
      rollupOptions: {
        input: {
          [outDirName.toLowerCase()]: resolve(__dirname, 'index.html'),
        },
        output: {
          // 按包名拆分第三方依赖，尽量减小每个入口需要加载的体积
          manualChunks(id) {
            if (!id || !id.includes('node_modules')) {
              return undefined;
            }
            const match = id.match(/node_modules\/(?:@([^/]+)\/)?([^/]+)/);
            if (!match) {
              return undefined;
            }
            const scope = match[1] ? `${match[1]}-` : '';
            const pkg = match[2];
            // 示例：vendor-react、vendor-react-dom、vendor-lodash
            return `vendor-${scope}${pkg}`;
          },
          // 应用内的资源输出到各自目录，避免不同应用之间互相覆盖
          entryFileNames: `${outDirName}/assets/[name].js`,
          chunkFileNames: `${outDirName}/assets/[name].js`,
          assetFileNames: assetInfo => {
            const ext = assetInfo.name?.split('.').pop();
            if (ext === 'css') {
              return `${outDirName}/assets/shared-common.css`;
            }
            return `${outDirName}/assets/[name].[ext]`;
          },
        },
      },
    },
    server: {
      port: devPort,
      strictPort: true,
      host: true,
    },
  });
}
