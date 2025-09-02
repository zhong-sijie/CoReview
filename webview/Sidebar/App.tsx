import { useEffect } from 'react';
import {
  Navigate,
  Outlet,
  RouterProvider,
  createHashRouter,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import '@common/base/App.css';
import { useAuthState } from '@common/hooks/useAuthState';
import { postMessage } from '@common/services/vscodeService';
import { EnumMessageType, EnumWebviewPath } from '@shared/enums';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';

/**
 * 应用主组件
 *
 * VS Code WebView应用的主入口，负责路由配置和认证状态管理。
 * 使用React Router进行页面路由，并根据登录状态进行页面跳转。
 *
 * 主要功能：
 * - 路由配置和页面导航
 * - 认证状态检查和页面守卫
 * - WebView就绪状态通知
 * - 自动页面跳转逻辑
 */

/**
 * 认证守卫组件
 *
 * 根据登录状态控制页面访问权限，实现自动页面跳转。
 * 未登录用户自动跳转到登录页，已登录用户访问登录页时自动跳转到主页。
 *
 * 执行逻辑：
 * - 未登录且不在登录页：跳转到登录页
 * - 已登录且在登录页：跳转到主页
 * - 其他情况：正常显示当前页面
 */
function AuthGuard() {
  /** 当前登录状态 */
  const { loggedIn } = useAuthState();
  /** 路由导航函数 */
  const navigate = useNavigate();
  /** 当前路由位置信息 */
  const location = useLocation();

  /**
   * 监听登录状态和路由变化
   *
   * 根据登录状态和当前路径自动进行页面跳转。
   * 确保用户始终在正确的页面上。
   */
  useEffect(() => {
    const path = location.pathname;
    if (!loggedIn && path !== EnumWebviewPath.Login) {
      navigate(EnumWebviewPath.Login, { replace: true });
      return;
    }
    if (loggedIn && path === EnumWebviewPath.Login) {
      navigate(EnumWebviewPath.Root, { replace: true });
    }
  }, [loggedIn, location.pathname, navigate]);

  return <Outlet />;
}

/**
 * 应用路由组件
 *
 * 配置应用的路由结构，使用Hash Router适配VS Code WebView环境。
 * 定义页面路由规则和默认重定向。
 *
 * 路由结构：
 * - /: 主页（需要认证）
 * - /login: 登录页（无需认证）
 * - 其他路径: 重定向到主页
 */
function AppRouter() {
  /** 路由配置对象 */
  const router = createHashRouter([
    {
      path: EnumWebviewPath.Root,
      element: <AuthGuard />,
      children: [
        { index: true, element: <HomePage /> },
        {
          path: EnumWebviewPath.Login.replace(/^\//, ''),
          element: <LoginPage />,
        },
        { path: '*', element: <Navigate to={EnumWebviewPath.Root} replace /> },
      ],
    },
  ]);

  return <RouterProvider router={router} />;
}

/**
 * 应用根组件
 *
 * 应用的根组件，负责初始化WebView就绪状态通知。
 * 在组件挂载时通知VS Code扩展端WebView已准备就绪。
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

  return <AppRouter />;
}
