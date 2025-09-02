import { useEffect, useMemo, useState } from 'react';
import { useAsyncAction } from '@common/hooks/useAsyncAction';
import { onMessage, postMessage } from '@common/services/vscodeService';
import { EnumMessageType } from '@shared/enums';
import type { ExtensionMessage } from '@shared/types';

/**
 * 登录页面组件
 *
 * 用于配置服务端地址并完成用户登录。
 * 连接测试成功后才允许编辑账号与密码，避免产生误导性的失败。
 *
 * 主要功能：
 * - 服务端地址配置和连接测试
 * - 用户账号密码输入和登录
 * - 与VS Code扩展端的认证状态同步
 * - 响应式的表单状态管理
 */

/**
 * 认证状态负载类型
 *
 * 定义从扩展端接收的认证状态消息的数据结构。
 */
type AuthStatePayload = {
  serverUrl?: string | null;
  connectionOk?: boolean;
  loggedIn?: boolean;
};

const LoginPage = () => {
  /** 服务端地址输入值 */
  const [serverUrl, setServerUrl] = useState('');
  /** 连接测试状态，true表示连接成功 */
  const [connectionOk, setConnectionOk] = useState(false);
  /** 用户名输入值 */
  const [username, setUsername] = useState('');
  /** 密码输入值 */
  const [password, setPassword] = useState('');

  // 异步操作 hooks
  /** 连接测试的异步操作 */
  const testConnectionAction = useAsyncAction();
  /** 登录的异步操作 */
  const loginAction = useAsyncAction();

  /**
   * 监听认证状态变化
   *
   * 在组件挂载时注册消息监听器，接收扩展端发送的认证状态。
   * 根据连接状态控制表单的可编辑性。
   */
  useEffect(() => {
    /**
     * 处理认证状态消息
     *
     * 当接收到扩展端发送的认证状态时，更新本地状态。
     * 如果连接失败，清空用户名和密码输入。
     */
    onMessage<AuthStatePayload>(
      EnumMessageType.AuthState,
      (message: ExtensionMessage<AuthStatePayload>) => {
        const { serverUrl, connectionOk } = message.payload || {};
        setServerUrl(serverUrl || '');
        setConnectionOk(!!connectionOk);
        if (!connectionOk) {
          setUsername('');
          setPassword('');
        }
      },
    );

    // 向扩展端请求当前认证状态
    postMessage(EnumMessageType.GetAuthState, {});
  }, []);

  /**
   * 判断是否可以编辑登录表单
   *
   * 只有在连接测试成功且不在测试过程中时，才允许编辑账号密码。
   * 使用 useMemo 优化性能，避免不必要的重新计算。
   */
  const canEditLoginForm = useMemo(
    () => connectionOk && !testConnectionAction.loading,
    [connectionOk, testConnectionAction.loading],
  );

  /**
   * 处理连接测试
   *
   * 向扩展端发送连接测试请求，验证服务端地址的有效性。
   * 测试成功后才允许用户输入账号密码。
   */
  const handleTestConnection = async () => {
    const { success } = await testConnectionAction.execute(
      EnumMessageType.TestConnection,
      {
        serverUrl,
      },
    );

    setConnectionOk(success);
  };

  /**
   * 处理登录操作
   *
   * 向扩展端发送登录请求，使用当前输入的用户名和密码。
   * 只有在表单可编辑且输入完整时才执行登录。
   */
  const handleLogin = () => {
    if (!canEditLoginForm) {
      return;
    }

    loginAction.execute(EnumMessageType.Login, { username, password });
  };

  /**
   * 渲染登录页面
   *
   * 包含服务端地址配置、连接测试、账号密码输入和登录按钮。
   * 使用VS Code主题变量确保与编辑器主题保持一致。
   */
  return (
    <div className="grid h-full w-full place-items-center p-4">
      <div className="mx-auto w-full max-w-[720px] overflow-hidden rounded-xl border border-[var(--vscode-panel-border)] p-0">
        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr]">
          <div className="p-6 md:p-8">
            <div className="mb-4 flex items-center justify-start">
              <div className="flex items-center gap-0">
                <h2 className="m-0 text-[16px] font-bold">CoReview 登录</h2>
              </div>
            </div>

            <p className="m-0 mb-5 text-[12px] opacity-80">
              先配置服务端地址并测试连接，然后使用账号密码登录。
            </p>

            <div className="mb-4">
              <label className="mb-2 block text-[11px] font-semibold">
                服务端地址
              </label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  className="w-full rounded-md border border-[var(--vscode-focusBorder)] bg-[var(--vscode-input-background)] px-3 py-2 text-[var(--vscode-input-foreground)] focus:border-[var(--vscode-focusBorder)] focus:outline-none focus:ring-1 focus:ring-[var(--vscode-focusBorder)]"
                  type="text"
                  placeholder="https://your-server"
                  value={serverUrl}
                  onChange={e => setServerUrl(e.target.value)}
                />
                <button
                  className="rounded-md border border-transparent bg-[var(--vscode-button-background)] px-4 py-2 text-[11px] font-semibold text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-60"
                  onClick={handleTestConnection}
                  disabled={testConnectionAction.loading || !serverUrl.trim()}>
                  {testConnectionAction.loading ? '测试中...' : '连接测试'}
                </button>
              </div>
              <p className="m-0 mt-2 text-[11px] opacity-70">
                例如: https://your-company-coreview.example.com
              </p>
            </div>

            <div className="mb-3">
              <label className="mb-2 block text-[11px] font-semibold">
                登录账号
              </label>
              <input
                className="w-full rounded-md border border-[var(--vscode-focusBorder)] bg-[var(--vscode-input-background)] px-3 py-2 text-[var(--vscode-input-foreground)] focus:border-[var(--vscode-focusBorder)] focus:outline-none focus:ring-1 focus:ring-[var(--vscode-focusBorder)]"
                type="text"
                placeholder="请输入账号"
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={!canEditLoginForm}
              />
            </div>

            <div className="mb-1">
              <label className="mb-2 block text-[11px] font-semibold">
                登录密码
              </label>
              <input
                className="w-full rounded-md border border-[var(--vscode-focusBorder)] bg-[var(--vscode-input-background)] px-3 py-2 text-[var(--vscode-input-foreground)] focus:border-[var(--vscode-focusBorder)] focus:outline-none focus:ring-1 focus:ring-[var(--vscode-focusBorder)]"
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={!canEditLoginForm}
              />
            </div>

            <div className="mt-4">
              <button
                className="w-full rounded-md border border-transparent bg-[var(--vscode-button-background)] py-2 text-[12px] font-bold text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-60"
                onClick={handleLogin}
                disabled={
                  !canEditLoginForm ||
                  loginAction.loading ||
                  !username.trim() ||
                  !password.trim()
                }>
                {loginAction.loading ? '登录中...' : '登录'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
