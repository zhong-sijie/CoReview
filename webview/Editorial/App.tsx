import { useEffect } from 'react';
import { Navigate, RouterProvider, createHashRouter } from 'react-router-dom';
import '@common/base/App.css';
import { postMessage } from '@common/services/vscodeService';
import { EnumMessageType } from '@shared/enums';
import AddReviewCommentPage from './pages/AddReviewCommentPage';

/**
 * 应用根组件
 *
 * 编辑区仅一个添加评审意见页面，无需权限路由。
 * 在组件挂载时通知扩展端 WebView 已就绪。
 */
export default function App() {
  /**
   * WebView 准备完成后通知扩展端
   *
   * 在组件挂载时发送WebviewReady消息，通知扩展端可以开始发送初始数据。
   * 这是WebView与扩展端通信的起点。
   */
  useEffect(() => {
    postMessage(EnumMessageType.WebviewReady, {});
  }, []);

  const router = createHashRouter([
    { path: '/', element: <AddReviewCommentPage /> },
    { path: '*', element: <Navigate to="/" replace /> },
  ]);

  return <RouterProvider router={router} />;
}
