import * as vscode from "vscode";
import { ExtensionMessage, WebViewMessage } from "../../shared/types";

/**
 * WebViewService 负责创建 Webview 面板并进行消息路由
 *
 * 对外暴露一个轻量的事件总线（messageHandlers），供 Provider 层注册处理器。
 *
 * 主要功能：
 * - 创建和管理 Webview 面板
 * - 处理 Webview 与扩展之间的消息传递
 * - 提供 HTML 内容注入能力
 * - 管理消息处理器注册和分发
 */
export class WebViewService {
  /** 单例实例 */
  private static instance: WebViewService;

  /** Webview 面板集合，按视图类型进行管理 */
  private webviewPanels: Map<string, vscode.WebviewPanel> = new Map();

  /** 消息处理器映射表，按消息类型注册对应的处理函数 */
  public messageHandlers: Map<
    string,
    (message: WebViewMessage<unknown>) => void
  > = new Map();

  /**
   * 私有构造函数
   *
   * 防止外部直接实例化，强制使用单例模式
   */
  private constructor() {}

  /**
   * 获取WebViewService的单例实例
   *
   * 如果实例不存在则创建新实例，如果已存在则返回现有实例
   */
  public static getInstance(): WebViewService {
    if (!WebViewService.instance) {
      WebViewService.instance = new WebViewService();
    }
    return WebViewService.instance;
  }

  /**
   * 创建 WebView 面板
   *
   * 创建并配置一个新的 Webview 面板，设置消息监听和清理逻辑
   *
   * 执行流程：
   * 1. 使用 VS Code API 创建 Webview 面板
   * 2. 设置消息监听器，接收来自 Webview 的消息
   * 3. 设置面板关闭时的清理逻辑
   * 4. 将面板添加到管理集合中
   */
  public createWebViewPanel(
    viewType: string,
    title: string,
    column: vscode.ViewColumn,
    options: vscode.WebviewPanelOptions & vscode.WebviewOptions
  ): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      viewType,
      title,
      column,
      options
    );

    // 设置消息监听器
    panel.webview.onDidReceiveMessage(
      (message: WebViewMessage) => {
        this.handleWebViewMessage(message);
      },
      undefined,
      []
    );

    // 面板关闭时清理
    panel.onDidDispose(() => {
      this.webviewPanels.delete(viewType);
    });

    this.webviewPanels.set(viewType, panel);
    return panel;
  }

  /**
   * 获取 WebView 面板
   *
   * 根据视图类型获取对应的 Webview 面板实例
   */
  public getWebViewPanel(viewType: string): vscode.WebviewPanel | undefined {
    return this.webviewPanels.get(viewType);
  }

  /**
   * 向 WebView 发送消息
   *
   * 向指定类型的 Webview 面板发送消息
   *
   * 执行流程：
   * 1. 根据视图类型查找对应的面板
   * 2. 如果面板存在，发送消息并返回成功
   * 3. 如果面板不存在，返回失败
   */
  public postMessage(
    viewType: string,
    message: ExtensionMessage<unknown>
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
   * 为指定的消息类型注册处理函数，用于处理来自 Webview 的消息
   */
  public registerMessageHandler<TPayload>(
    type: string,
    handler: (message: WebViewMessage<TPayload>) => void
  ): void {
    this.messageHandlers.set(
      type,
      handler as (message: WebViewMessage<unknown>) => void
    );
  }

  /**
   * 处理来自 WebView 的消息
   *
   * 根据消息类型查找并调用对应的处理函数
   */
  private handleWebViewMessage(message: WebViewMessage): void {
    const handler = this.messageHandlers.get(message.type);
    handler?.(message);
  }

  /**
   * 生成随机 nonce 值
   *
   * 用于 Content Security Policy 中的脚本安全控制
   *
   * 执行流程：
   * 1. 从字符集中随机选择字符
   * 2. 生成32位随机字符串
   */
  private getNonce(): string {
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let text = "";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * 获取 Webview 资源 URI
   *
   * 将扩展内的文件路径转换为 Webview 可访问的 URI
   *
   * 执行流程：
   * 1. 将扩展 URI 和路径片段组合
   * 2. 转换为 Webview 可访问的 URI 格式
   */
  private getWebviewUri(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    ...pathSegments: string[]
  ): vscode.Uri {
    return webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, ...pathSegments)
    );
  }

  /**
   * 获取 WebView 的 HTML 内容
   *
   * 生成完整的 HTML 页面，包含必要的安全策略和资源引用
   *
   * 执行流程：
   * 1. 生成随机 nonce 值用于 CSP
   * 2. 构建资源 URI（脚本和样式文件）
   * 3. 配置 Content Security Policy
   * 4. 生成完整的 HTML 文档
   */
  public getWebViewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
  ): string {
    const nonce = this.getNonce();

    // 资源路径（已在 vite 配置中固定文件名）
    const scriptUri = this.getWebviewUri(
      webview,
      extensionUri,
      "webview-dist",
      "assets",
      "main.js"
    );
    const styleUri = this.getWebviewUri(
      webview,
      extensionUri,
      "webview-dist",
      "assets",
      "main.css"
    );

    const csp = [
      `default-src 'none';`,
      `img-src ${webview.cspSource} https: data:;`,
      `style-src ${webview.cspSource} 'unsafe-inline';`,
      `font-src ${webview.cspSource};`,
      `script-src 'nonce-${nonce}';`,
    ].join(" ");

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CoReview</title>
  <link href="${styleUri}" rel="stylesheet" />
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
  <script type="module" src="${scriptUri}" nonce="${nonce}"></script>
</body>
</html>`;
  }

  /**
   * 获取资源URI
   *
   * 将扩展内的文件路径转换为 Webview 可访问的 URI
   *
   * 执行流程：
   * 1. 将扩展 URI 和文件路径组合
   * 2. 转换为 Webview 可访问的 URI 格式
   */
  public getResourceUri(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    path: string
  ): vscode.Uri {
    return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, path));
  }
}
