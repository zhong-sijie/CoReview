import * as vscode from "vscode";
import { EnumCommands } from "../../shared/enums";
import { ReviewViewProvider } from "../providers/ReviewViewProvider";
import { AuthService } from "../services/AuthService";
import { StateService } from "../services/StateService";
import { showError, showInfo, showWarning } from "../utils";

/**
 * 命令管理器类
 *
 * 负责管理VS Code扩展中的所有命令注册和处理逻辑。
 * 采用单例模式确保全局只有一个命令管理器实例。
 *
 * 主要功能：
 * - 注册VS Code命令
 * - 处理用户交互命令
 * - 协调各个服务之间的交互
 * - 管理视图提供者的生命周期
 */
export class CommandManager {
  /** 单例实例，确保全局只有一个CommandManager实例 */
  private static instance: CommandManager;

  /** 视图提供者实例，用于与WebView进行通信 */
  private viewProvider?: ReviewViewProvider;

  /**
   * 私有构造函数
   *
   * 防止外部直接实例化，强制使用单例模式。
   * 通过getInstance()方法获取实例。
   */
  private constructor() {}

  /**
   * 获取CommandManager的单例实例
   *
   * 如果实例不存在则创建新实例，如果已存在则返回现有实例。
   * 确保整个扩展中只有一个命令管理器实例。
   */
  public static getInstance(): CommandManager {
    if (!CommandManager.instance) {
      CommandManager.instance = new CommandManager();
    }
    return CommandManager.instance;
  }

  /**
   * 设置视图提供者
   *
   * 用于建立命令管理器与WebView之间的通信桥梁。
   * 视图提供者负责处理WebView的显示和消息传递。
   */
  public setViewProvider(provider: ReviewViewProvider): void {
    this.viewProvider = provider;
  }

  /**
   * 注册所有VS Code命令
   *
   * 将扩展中定义的所有命令注册到VS Code命令系统中。
   * 每个命令都绑定到对应的处理方法，并添加到扩展上下文的订阅列表中。
   *
   * 注册的命令包括：
   * - LOGOUT: 退出登录命令
   * - OPEN_WEB_PAGE: 打开Web页面命令
   * - REFRESH_REVIEWS: 刷新WebView命令
   */
  public registerCommands(context: vscode.ExtensionContext): void {
    // 退出登录命令
    const logoutCommand = vscode.commands.registerCommand(
      EnumCommands.LOGOUT,
      this.handleLogout.bind(this)
    );

    // 打开Web页面命令
    const openWebPageCommand = vscode.commands.registerCommand(
      EnumCommands.OPEN_WEB_PAGE,
      this.handleOpenWebPage.bind(this)
    );

    // 刷新整个 Webview
    const refreshReviewsCommand = vscode.commands.registerCommand(
      EnumCommands.REFRESH_REVIEWS,
      this.handleRefreshWebview.bind(this)
    );

    context.subscriptions.push(
      logoutCommand,
      openWebPageCommand,
      refreshReviewsCommand
    );
  }

  /**
   * 处理退出登录命令
   *
   * 当用户触发退出登录命令时执行此方法。
   * 调用认证服务执行登出操作，并通知WebView更新认证状态。
   *
   * 执行流程：
   * 1. 调用AuthService的loadLogout方法执行登出
   * 2. 如果视图提供者存在，广播认证状态变化
   * 3. 显示成功或失败的用户提示
   */
  private async handleLogout(): Promise<void> {
    try {
      await AuthService.getInstance().loadLogout();
      if (this.viewProvider) {
        this.viewProvider.broadcastAuthState();
      }
      showInfo("已退出登录");
    } catch {
      showError("退出登录失败");
    }
  }

  /**
   * 处理打开Web页面命令
   *
   * 当用户触发打开Web页面命令时执行此方法。
   * 检查服务器地址配置，然后使用系统默认浏览器打开服务器URL。
   *
   * 执行流程：
   * 1. 从StateService获取当前状态
   * 2. 检查serverUrl是否已配置
   * 3. 使用vscode.env.openExternal打开外部浏览器
   * 4. 显示成功或失败的用户提示
   */
  private async handleOpenWebPage(): Promise<void> {
    try {
      const state = StateService.getInstance().getState();

      if (!state.serverUrl) {
        showError("未配置服务器地址，请先进行连接测试");
        return;
      }

      // 使用 VS Code 的 env.openExternal 打开浏览器
      await vscode.env.openExternal(vscode.Uri.parse(state.serverUrl));
    } catch {
      showError("打开Web页面失败");
    }
  }

  /**
   * 处理刷新WebView命令
   *
   * 当用户触发刷新命令时执行此方法。
   * 重新加载WebView内容，用于更新界面显示。
   *
   * 执行流程：
   * 1. 检查视图提供者是否存在
   * 2. 如果存在，调用reloadWebview方法重新加载
   * 3. 如果不存在，显示警告信息
   */
  private async handleRefreshWebview(): Promise<void> {
    if (this.viewProvider) {
      this.viewProvider.reloadWebview();
    } else {
      showWarning("视图尚未就绪，稍后重试");
    }
  }
}
