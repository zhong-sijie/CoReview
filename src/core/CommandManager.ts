import * as childProcess from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { EnumCommands } from '../../shared/enums';
import { normalizeFilePath } from '../../shared/utils';
import { EditorialViewProvider } from '../providers/EditorialViewProvider';
import { ReviewViewProvider } from '../providers/ReviewViewProvider';
import { AuthService } from '../services/AuthService';
import { LogService } from '../services/LogService';
import { StateService } from '../services/StateService';
import { showError, showInfo, showWarning } from '../utils';

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

  /** 主视图提供者实例，用于与WebView进行通信 */
  private viewProvider?: ReviewViewProvider;

  /** 编辑视图提供者实例，用于管理评审意见面板 */
  private editorialProvider?: EditorialViewProvider;

  /** 状态服务实例，用于获取用户信息等状态 */
  private stateService: StateService;

  /** 日志服务实例 */
  private log: LogService;

  /**
   * 私有构造函数
   *
   * 防止外部直接实例化，强制使用单例模式。
   * 通过getInstance()方法获取实例。
   */
  private constructor() {
    this.stateService = StateService.getInstance();
    this.log = LogService.getInstance();
  }

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
   * 设置主视图提供者
   *
   * 用于建立命令管理器与WebView之间的通信桥梁。
   * 视图提供者负责处理WebView的显示和消息传递。
   */
  public setViewProvider(provider: ReviewViewProvider): void {
    this.viewProvider = provider;
  }

  /**
   * 设置编辑视图提供者
   *
   * 用于管理评审意见的编辑面板。
   */
  public setEditorialProvider(provider: EditorialViewProvider): void {
    this.editorialProvider = provider;
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
   * - ADD_REVIEW_COMMENT: 添加评审意见命令
   */
  public registerCommands(context: vscode.ExtensionContext): void {
    this.log.info('开始注册 VS Code 命令', 'CommandManager');
    // 退出登录命令
    const logoutCommand = vscode.commands.registerCommand(
      EnumCommands.LOGOUT,
      this.handleLogout.bind(this),
    );

    // 打开Web页面命令
    const openWebPageCommand = vscode.commands.registerCommand(
      EnumCommands.OPEN_WEB_PAGE,
      this.handleOpenWebPage.bind(this),
    );

    // 刷新整个 Webview
    const refreshReviewsCommand = vscode.commands.registerCommand(
      EnumCommands.REFRESH_REVIEWS,
      this.handleRefreshWebview.bind(this),
    );

    // 添加评审意见命令
    const addReviewCommentCommand = vscode.commands.registerCommand(
      EnumCommands.ADD_REVIEW_COMMENT,
      this.handleAddReviewComment.bind(this),
    );

    // 查看日志命令
    const viewLogsCommand = vscode.commands.registerCommand(
      EnumCommands.VIEW_LOGS,
      this.handleViewLogs.bind(this),
    );

    context.subscriptions.push(
      logoutCommand,
      openWebPageCommand,
      refreshReviewsCommand,
      addReviewCommentCommand,
      viewLogsCommand,
    );

    this.log.info('注册 VS Code 命令完成', 'CommandManager', {
      commands: Object.values(EnumCommands),
    });
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
      this.log.info('触发登出操作', 'CommandManager');
      await AuthService.getInstance().loadLogout();
      if (this.viewProvider) {
        this.viewProvider.broadcastAuthState();
      }
      showInfo('已退出登录');
      this.log.info('登出操作成功', 'CommandManager');
    } catch {
      showError('退出登录失败');
      this.log.error('登出操作失败', 'CommandManager');
    }
  }

  /**
   * 处理打开Web页面命令
   *
   * 当用户触发打开Web页面命令时执行此方法。
   * 检查服务器地址配置，然后使用系统默认浏览器打开服务器URL。
   *
   * 执行流程：
   * 1. 检查serverUrl是否已配置
   * 2. 使用vscode.env.openExternal打开外部浏览器
   * 3. 显示成功或失败的用户提示
   */
  private async handleOpenWebPage(): Promise<void> {
    try {
      this.log.info('触发打开 Web 页面操作', 'CommandManager');

      // 检查服务器地址是否已配置
      const state = this.stateService.getState();

      if (!state.serverUrl) {
        showError('请先在 CoReview 面板中配置服务器地址');
        this.log.warn(
          '打开 Web 页面被拒绝：未配置服务器地址',
          'CommandManager',
        );
        return;
      }

      // 使用系统默认浏览器打开服务器URL
      const url = vscode.Uri.parse(state.serverUrl);
      await vscode.env.openExternal(url);

      this.log.info('成功打开 Web 页面', 'CommandManager', {
        serverUrl: state.serverUrl,
      });
    } catch (error) {
      showError('打开Web页面失败');
      this.log.error('打开 Web 页面失败', 'CommandManager', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 处理刷新WebView命令
   *
   * 当用户触发刷新命令时执行此方法。
   * 重新加载侧边栏 Webview 的 HTML，使其在收到 WebviewReady 后通过缓存快速恢复数据；
   * 同时若编辑面板已打开，则主动向其重新下发 EditorialInit 数据以更新表单字段。
   *
   * 执行流程：
   * 1. 检查视图提供者是否存在
   * 2. 如果存在，调用 reloadWebview 重新注入 HTML，等待 WebviewReady 后由 ReviewViewProvider 发送数据
   * 3. 若 Editorial 面板存在，调用 refreshEditorialData 触发重新下发 EditorialInit（读取 StateService 的列配置缓存）
   * 4. 如果不存在，显示警告信息
   */
  private async handleRefreshWebview(): Promise<void> {
    if (this.viewProvider) {
      this.log.info('触发刷新 Webview 操作', 'CommandManager');
      this.viewProvider.reloadWebview();

      // 同时刷新编辑面板数据，确保使用最新的列配置
      if (this.editorialProvider) {
        console.log('触发刷新编辑面板数据', 'CommandManager');
        this.editorialProvider.refreshEditorialData();
      }
    } else {
      showWarning('视图尚未就绪，稍后重试');
      this.log.warn('刷新 Webview 被忽略：视图未就绪', 'CommandManager');
    }
  }

  /**
   * 处理添加评审意见命令
   *
   * 当用户触发 Alt+A 快捷键时执行此方法。
   * 获取选中文本信息，然后委托给编辑面板处理。
   *
   * 执行流程：
   * 1. 检查列配置是否存在，不存在则禁用功能
   * 2. 获取当前编辑器的选中文本和位置信息
   * 3. 委托给 EditorialViewProvider 处理登录状态检查和面板创建
   * 4. 如果条件不满足，显示相应的错误提示
   */
  private async handleAddReviewComment(): Promise<void> {
    // 检查列配置是否存在
    const stateService = StateService.getInstance();
    const columnConfig = stateService.getColumnConfig();

    if (!columnConfig || columnConfig.length === 0) {
      this.log.warn('添加评审意见被忽略：未配置列信息', 'CommandManager');
      return;
    }

    // 获取当前活动的文本编辑器
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    // 获取所有选中的文本段
    const selections = editor.selections;

    if (selections.length === 0) {
      this.log.warn('添加评审意见被忽略：未选择文本', 'CommandManager');
      return;
    }

    // 收集所有选中的文本和行号信息
    const selectedSegments: Array<{
      text: string;
      startLine: number;
      endLine: number;
      lineRange: string;
    }> = [];

    for (const selection of selections) {
      const text = editor.document.getText(selection);
      if (text.trim()) {
        const startLine = selection.start.line + 1;
        const endLine = selection.end.line + 1;
        const lineRange = `${startLine} ~ ${endLine}`;

        selectedSegments.push({
          text,
          startLine,
          endLine,
          lineRange,
        });
      }
    }

    if (selectedSegments.length === 0) {
      return;
    }

    // 按起始行号排序，保持代码块的原始位置顺序
    selectedSegments.sort((a, b) => a.startLine - b.startLine);

    // 合并所有选中的文本（按行号顺序）
    const selectedText = selectedSegments
      .map(segment => segment.text)
      .join('\n');

    // 生成行号显示字符串（按行号顺序）
    const lineRanges = selectedSegments.map(segment => segment.lineRange);
    const lineNumber = lineRanges.join('; ');

    // 获取当前文件的绝对路径
    const absolutePath = editor.document.fileName;

    // 获取 git 信息
    const gitInfo = await this.getGitInfo(absolutePath);

    // 委托给编辑面板处理（包括登录状态检查）
    if (this.editorialProvider) {
      // 获取用户信息
      const userDetail = this.stateService.getUserDetail();

      this.log.info('创建评审意见编辑面板', 'CommandManager', {
        filePath: absolutePath,
        lineNumber,
        selections: selectedSegments,
        selectedText,
      });
      await this.editorialProvider.createPanel(
        selectedText,
        lineNumber,
        absolutePath,
        gitInfo,
        userDetail,
      );
      this.log.info('编辑面板创建完成', 'CommandManager');
    } else {
      showError('编辑面板未初始化，请重启扩展');
      this.log.error('编辑面板未初始化', 'CommandManager');
    }
  }

  /**
   * 打开最新日志文件
   */
  private async handleViewLogs(): Promise<void> {
    try {
      const logService = LogService.getInstance();
      const filePath = logService.getLogFilePath();
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch {
      showError('打开日志失败');
    }
  }

  /**
   * 获取 git 信息
   *
   * @param filePath 文件绝对路径
   * @returns git 仓库地址和分支信息
   */
  private async getGitInfo(filePath: string): Promise<{
    repositoryUrl: string | null;
    branchName: string | null;
  }> {
    try {
      // 标准化文件路径，统一使用正斜杠格式
      const normalizedFilePath = normalizeFilePath(filePath);
      this.log.debug('开始解析 Git 信息', 'CommandManager', {
        originalPath: filePath,
        normalizedPath: normalizedFilePath,
      });
      // 获取文件所在目录
      const fileDir = path.dirname(normalizedFilePath);

      // 获取 git 仓库根目录
      const gitRoot = childProcess
        .execSync('git rev-parse --show-toplevel', {
          cwd: fileDir,
          encoding: 'utf8',
        })
        .trim();

      // 获取远程仓库 URL
      const repositoryUrl = childProcess
        .execSync('git config --get remote.origin.url', {
          cwd: gitRoot,
          encoding: 'utf8',
        })
        .trim();

      // 获取当前分支名
      const branchName = childProcess
        .execSync('git branch --show-current', {
          cwd: gitRoot,
          encoding: 'utf8',
        })
        .trim();

      this.log.debug('解析 Git 信息完成', 'CommandManager', {
        repositoryUrl,
        branchName,
      });
      return {
        repositoryUrl: repositoryUrl || null,
        branchName: branchName || null,
      };
    } catch {
      this.log.warn('解析 Git 信息失败，将使用空信息', 'CommandManager', {
        filePath,
      });
      return {
        repositoryUrl: null,
        branchName: null,
      };
    }
  }
}
