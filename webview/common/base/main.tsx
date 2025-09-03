import React from 'react';
import ReactDOM from 'react-dom/client';
import App from 'app-component';
import '@common/base/tailwind.css';
import { initializeVSCodeService } from '@common/services/vscodeService';
import { reportLog } from '@common/services/vscodeService';
import { EnumLogLevel } from '@shared/enums';

// 初始化 VSCode 通信服务
try {
  initializeVSCodeService();
  reportLog(EnumLogLevel.INFO, '初始化 VSCode 服务完成', {
    context: 'webview-main',
  });
} catch (e) {
  reportLog(EnumLogLevel.ERROR, '初始化 VSCode 服务失败', {
    context: 'webview-main',
    error: e instanceof Error ? e.message : String(e),
  });
}

const startedAt = performance.now();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// 渲染完成后打点
queueMicrotask(() => {
  const durationMs = performance.now() - startedAt;
  reportLog(EnumLogLevel.INFO, '应用渲染完成', {
    context: 'webview-main',
    durationMs,
  });
});
