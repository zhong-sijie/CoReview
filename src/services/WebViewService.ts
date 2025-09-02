import * as vscode from 'vscode';
import { ExtensionMessage, WebViewMessage } from '../../shared/types';
import { createUniqueId } from '../../shared/utils';

/**
 * WebView 服务
 *
 * 负责创建 Webview 面板并进行消息路由，每个 Provider 使用独立的实例。
 * 主要功能包括面板管理、消息处理、HTML 内容生成等。
 *
 * 关键设计：
 * - 每个 Provider 使用独立的 WebViewService 实例，避免消息处理器冲突
 * - 支持多种类型的 Webview 面板管理
 * - 提供完整的 HTML 内容生成能力，包含安全策略
 * - 统一的消息处理器注册和分发机制
 */
export class WebViewService {
  /** Webview 面板集合，按视图类型进行管理 */
  private webviewPanels: Map<string, vscode.WebviewPanel> = new Map();

  /** 消息处理器映射表，按消息类型注册对应的处理函数 */
  public messageHandlers: Map<
    string,
    (message: WebViewMessage<unknown>) => void
  > = new Map();

  /** Provider 标识符 */
  private providerId: string;

  /**
   * 构造函数
   *
   * @param providerId Provider 的唯一标识符
   */
  constructor(providerId: string) {
    this.providerId = providerId;
  }

  /**
   * 创建 WebView 面板
   *
   * 创建并配置一个新的 Webview 面板，设置消息监听和清理逻辑。
   * 面板创建后会自动添加到管理集合中，支持后续的查找和操作。
   *
   * 执行流程：
   * 1. 使用 VS Code API 创建 Webview 面板
   * 2. 设置消息监听器，接收来自 Webview 的消息
   * 3. 设置面板关闭时的清理逻辑
   * 4. 将面板添加到管理集合中
   *
   * @param viewType 视图类型标识符
   * @param title 面板标题
   * @param column 面板显示位置
   * @param options 面板配置选项
   * @returns 创建的 Webview 面板实例
   */
  public createWebViewPanel(
    viewType: string,
    title: string,
    column: vscode.ViewColumn,
    options: vscode.WebviewPanelOptions & vscode.WebviewOptions,
  ): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      viewType,
      title,
      column,
      options,
    );

    // 设置消息监听器
    panel.webview.onDidReceiveMessage(
      (message: WebViewMessage) => {
        this.handleWebViewMessage(message);
      },
      undefined,
      [],
    );

    // 面板关闭时清理
    panel.onDidDispose(() => {
      this.webviewPanels.delete(viewType);
    });

    this.webviewPanels.set(viewType, panel);
    return panel;
  }

  /**
   * 向 WebView 发送消息
   *
   * 向指定类型的 Webview 面板发送消息。
   * 如果面板不存在，发送失败并返回 false。
   *
   * 执行流程：
   * 1. 根据视图类型查找对应的面板
   * 2. 如果面板存在，发送消息并返回成功
   * 3. 如果面板不存在，返回失败
   *
   * @param viewType 视图类型标识符
   * @param message 要发送的消息
   * @returns 发送是否成功
   */
  public postMessage(
    viewType: string,
    message: ExtensionMessage<unknown>,
  ): boolean {
    const panel = this.webviewPanels.get(viewType);
    if (panel) {
      panel.webview.postMessage(message);
      return true;
    }
    return false;
  }

  /**
   * 注册消息处理器
   *
   * 为指定的消息类型注册处理函数，用于处理来自 Webview 的消息。
   * 每个消息类型只能有一个处理器，后注册的会覆盖先注册的。
   *
   * @param type 消息类型标识符
   * @param handler 消息处理函数
   */
  public registerMessageHandler<TPayload>(
    type: string,
    handler: (message: WebViewMessage<TPayload>) => void,
  ): void {
    this.messageHandlers.set(
      type,
      handler as (message: WebViewMessage<unknown>) => void,
    );
  }

  /**
   * 处理来自 WebView 的消息
   *
   * 根据消息类型查找并调用对应的处理函数。
   * 如果消息类型没有注册处理器，则忽略该消息。
   *
   * @param message 来自 Webview 的消息对象
   */
  private handleWebViewMessage(message: WebViewMessage): void {
    const handler = this.messageHandlers.get(message.type);
    handler?.(message);
  }

  /**
   * 获取 Webview 资源 URI
   *
   * 将扩展内的文件路径转换为 Webview 可访问的 URI。
   * 这是 Webview 安全机制的一部分，确保只能访问允许的资源。
   *
   * 执行流程：
   * 1. 将扩展 URI 和路径片段组合
   * 2. 转换为 Webview 可访问的 URI 格式
   *
   * @param webview Webview 实例
   * @param extensionUri 扩展根目录 URI
   * @param pathSegments 路径片段数组
   * @returns Webview 可访问的 URI
   */
  private getWebviewUri(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    ...pathSegments: string[]
  ): vscode.Uri {
    return webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, ...pathSegments),
    );
  }

  /**
   * 获取 WebView 的 HTML 内容
   *
   * 生成完整的 HTML 页面，包含必要的安全策略和资源引用。
   * 支持 Sidebar 和 Editorial 两种应用类型，自动配置相应的资源路径。
   *
   * 执行流程：
   * 1. 生成随机 nonce 值用于 CSP
   * 2. 构建资源 URI（脚本和样式文件）
   * 3. 配置 Content Security Policy
   * 4. 生成完整的 HTML 文档
   *
   * @param webview Webview 实例
   * @param extensionUri 扩展根目录 URI
   * @param options 配置选项，包含应用类型、标题、额外脚本和样式等
   * @returns 完整的 HTML 文档字符串
   */
  public getWebViewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    options?: {
      app?: 'Sidebar' | 'Editorial';
      title?: string;
      additionalScripts?: string[];
      additionalStyles?: string[];
    },
  ): string {
    const nonce = createUniqueId();

    const app = options?.app ?? 'Sidebar'; // 支持 Sidebar 与 Editorial
    const lowerApp = app.toLowerCase();
    const title = options?.title ?? 'CoReview';

    // 资源路径（构建后入口脚本会自动按需加载其依赖切片）
    const appScriptUri = this.getWebviewUri(
      webview,
      extensionUri,
      'webview-dist',
      app,
      'assets',
      `${lowerApp}.js`,
    );
    const appStyleUri = this.getWebviewUri(
      webview,
      extensionUri,
      'webview-dist',
      app,
      'assets',
      'shared-common.css',
    );

    const csp = [
      "default-src 'none';",
      `img-src ${webview.cspSource} https: data:;`,
      `style-src ${webview.cspSource} 'unsafe-inline';`,
      `font-src ${webview.cspSource};`,
      // 允许从本扩展资源加载模块分片（如 shared/vendor.js）并保持 nonce 保护
      `script-src ${webview.cspSource} 'nonce-${nonce}';`,
    ].join(' ');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link href="${appStyleUri}" rel="stylesheet" />
  ${(options?.additionalStyles || [])
    .map(s => {
      const uri = this.getWebviewUri(webview, extensionUri, s).toString();
      return `<link href="${uri}" rel="stylesheet" />`;
    })
    .join('\n  ')}
  <style>
    html, body, #root { height: 100%; margin: 0; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    window.acquireVsCodeApi = () => vscode;
  </script>
  <script type="module" src="${appScriptUri}" nonce="${nonce}"></script>
  ${(options?.additionalScripts || [])
    .map(s => {
      const uri = this.getWebviewUri(webview, extensionUri, s).toString();
      return `<script type="module" src="${uri}" nonce="${nonce}"></script>`;
    })
    .join('\n  ')}
</body>
</html>`;
  }
}
