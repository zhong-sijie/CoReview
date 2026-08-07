import * as vscode from 'vscode';
import { EnumMessageType, EnumViews } from '../../shared/enums';
import { injectProjectEnumValues } from '../../shared/projectList';
import {
  ProjectOptionResponse,
  SaveReviewCommentPayload,
  UserDetail,
  WebViewMessage,
} from '../../shared/types';
import { normalizeFilePath, toWorkspaceRelativePath } from '../../shared/utils';
import { LogService } from '../services/LogService';
import { ProjectListService } from '../services/ProjectListService';
import { StateService } from '../services/StateService';
import { WebViewService } from '../services/WebViewService';
import { showError, showInfo } from '../utils';

/**
 * 编辑视图提供者
 *
 * 负责管理添加评审意见的独立 WebView 面板，与主视图协调工作。
 * 主要功能包括创建编辑面板、处理评审意见提交、管理选中文本信息等。
 *
 * 关键设计：
 * - 独立的 WebView 面板，不占用主视图空间
 * - 支持多段文本选择和处理
 * - 与主视图通过回调函数协调工作
 */
export class EditorialViewProvider {
  /** 视图类型标识符，对应 EnumViews.EDITORIAL_VIEW */
  public static readonly viewType = EnumViews.EDITORIAL_VIEW;

  /** Webview 面板实例，用于显示编辑界面 */
  private _panel?: vscode.WebviewPanel;

  /** Webview 服务实例，负责 HTML 注入和消息处理 */
  private webViewService: WebViewService;

  /** 状态服务实例，负责状态管理 */
  private stateService: StateService;

  /** 用于通知其他视图的回调函数，当有新评审意见时调用 */
  private onNewCommentAdded?: () => void;

  /** 项目列表更新时通知 Sidebar 同步 */
  private onProjectsUpdated?: (projects: ProjectOptionResponse[]) => void;

  /** 日志服务实例 */
  private log: LogService;

  /** 当前选中的文本信息，包含文本内容、行号、文件路径等 */
  private selectedTextInfo?: {
    /** 处理后的选中文本内容 */
    text: string;
    /** 行号信息，支持单行数字或多行区间 "1 ～ 5" */
    lineNumber: string;
    /** 文件相对路径 */
    filePath: string;
    /** 整个文件内容快照，用于上下文展示 */
    fileSnapshot: string;
    /** Git 仓库信息，包含仓库地址和分支名 */
    gitInfo?: {
      repositoryUrl: string | null;
      branchName: string | null;
    };
    /** 用户详情信息 */
    userDetail?: unknown | null;
  };

  /**
   * 构造函数
   *
   * 初始化编辑视图提供者，设置依赖服务和消息处理器。
   *
   * @param _extensionUri 扩展的根目录 URI
   * @param onNewCommentAdded 新增评审意见时的回调函数
   * @param onProjectsUpdated 项目列表从网络刷新后的回调函数
   */
  constructor(
    private readonly _extensionUri: vscode.Uri,
    onNewCommentAdded?: () => void,
    onProjectsUpdated?: (projects: ProjectOptionResponse[]) => void,
  ) {
    this.webViewService = new WebViewService('editorial');
    this.stateService = StateService.getInstance();
    this.onNewCommentAdded = onNewCommentAdded;
    this.onProjectsUpdated = onProjectsUpdated;
    this.log = LogService.getInstance();
    this.setupMessageHandlers();
    this.log.info('初始化编辑视图提供者', 'EditorialViewProvider');
  }

  /**
   * 将绝对路径转换为工作区相对路径
   *
   * 如果无法转换为相对路径，则返回原始绝对路径。
   * 主要用于在界面上显示更友好的文件路径。
   * 统一使用正斜杠格式，提供一致的跨平台体验。
   *
   * 执行流程：
   * 1. 获取当前工作区文件夹列表
   * 2. 查找包含当前文件的工作区
   * 3. 计算相对路径（自动使用正斜杠格式）
   * 4. 如果无法转换，返回原始路径
   *
   * @param absolutePath 文件的绝对路径
   * @returns 工作区相对路径或原始绝对路径（统一使用正斜杠）
   */
  private toWorkspaceRelativePath(absolutePath: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspaceFolder = workspaceFolders.find(folder =>
        absolutePath.startsWith(folder.uri.fsPath),
      );
      if (workspaceFolder) {
        // 使用共享工具函数处理路径转换（自动使用正斜杠格式）
        return toWorkspaceRelativePath(
          absolutePath,
          workspaceFolder.uri.fsPath,
        );
      }
    }
    // 返回标准化后的绝对路径（自动使用正斜杠格式）
    return normalizeFilePath(absolutePath);
  }

  /**
   * 读取绝对路径文件的内容作为快照
   *
   * 获取整个文件的内容，用于在编辑界面中提供代码上下文。
   * 如果读取失败，返回空字符串并记录警告。
   *
   * @param absolutePath 文件的绝对路径
   * @returns 文件内容字符串，失败时返回空字符串
   */
  private async readFileSnapshot(absolutePath: string): Promise<string> {
    try {
      this.log.debug('开始读取文件快照', 'EditorialViewProvider', {
        absolutePath,
      });
      const uri = vscode.Uri.file(absolutePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const content = document.getText();
      this.log.debug('读取文件快照完成', 'EditorialViewProvider', {
        length: content.length,
      });
      return content;
    } catch {
      this.log.warn('读取文件快照失败，返回空字符串', 'EditorialViewProvider', {
        absolutePath,
      });
      return '';
    }
  }

  /**
   * 创建编辑面板
   *
   * 创建或显示编辑评审意见的 WebView 面板，设置选中文本信息和相关数据。
   * 如果面板已存在，则显示现有面板；否则创建新面板。
   *
   * 执行流程：
   * 1. 检查用户登录状态，未登录则提示并返回
   * 2. 处理多段文本选择，确保文本格式正确
   * 3. 计算展示用的相对路径和获取文件内容快照
   * 4. 保存选中文本信息到内部状态
   * 5. 如果面板已存在，显示现有面板
   * 6. 否则创建新的 WebView 面板并设置内容
   * 7. 设置面板关闭时的清理逻辑
   *
   * @param selectedText 选中的文本内容
   * @param lineNumber 行号信息（支持单行数字或多行区间 "1 ～ 5"）
   * @param absolutePath 文件的绝对路径
   * @param gitInfo Git 仓库信息，包含仓库地址和分支名
   * @param userDetail 用户详情信息
   */
  public async createPanel(
    selectedText: string,
    lineNumber: string,
    absolutePath: string,
    gitInfo?: {
      repositoryUrl: string | null;
      branchName: string | null;
    },
    userDetail?: UserDetail | null,
  ): Promise<void> {
    // 检查登录状态
    const state = this.stateService.getState();
    if (!state.loggedIn) {
      showError('请先登录后再添加评审意见');
      this.log.warn('创建编辑面板被拒绝：未登录', 'EditorialViewProvider');
      return;
    }

    // 处理多段文本（CommandManager 已合并，此处直接使用）
    const processedText = selectedText;

    // 计算展示用相对路径 & 获取文件内容快照
    const filePath = this.toWorkspaceRelativePath(absolutePath);
    const fileSnapshot = await this.readFileSnapshot(absolutePath);

    // 保存选中文本信息
    this.selectedTextInfo = {
      text: processedText,
      lineNumber,
      filePath,
      fileSnapshot,
      gitInfo,
      userDetail,
    };
    this.log.info('保存选中文本信息', 'EditorialViewProvider', {
      filePath,
      lineNumber,
      text: processedText,
    });

    await this.refreshProjectsForAddReview();

    // 如果面板已存在，显示并更新内容
    if (this._panel) {
      this.log.info('复用已存在的编辑面板', 'EditorialViewProvider');
      this._panel.reveal();
      void this.sendEditorialInitData();
      return;
    }

    // 创建新的 WebView 面板
    this._panel = this.webViewService.createWebViewPanel(
      EditorialViewProvider.viewType,
      '添加评审意见',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this._extensionUri],
      },
    );
    this.log.info('创建编辑面板成功', 'EditorialViewProvider');

    // 设置面板内容
    this._panel.webview.html = this.getHtmlForWebview(this._panel.webview);
    this.log.debug('注入编辑页面 HTML 完成', 'EditorialViewProvider');

    // 面板关闭时清理
    this._panel.onDidDispose(() => {
      this._panel = undefined;
      this.selectedTextInfo = undefined;
      this.log.info('编辑面板已关闭并完成清理', 'EditorialViewProvider');
    });
  }

  /**
   * 获取 Webview 的 HTML 内容
   *
   * 通过 WebView 服务生成完整的 HTML 页面内容。
   *
   * @param webview Webview 实例
   * @returns 完整的 HTML 字符串
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    const html = this.webViewService.getWebViewContent(
      webview,
      this._extensionUri,
      {
        app: 'Editorial',
        title: '添加评审意见',
      },
    );
    return html;
  }

  /**
   * 注册消息处理器
   *
   * 设置 WebView 与扩展之间的消息通信处理器。
   * 主要处理 Webview 准备就绪和保存评审意见的消息。
   */
  private setupMessageHandlers(): void {
    this.log.info('注册编辑视图消息处理器', 'EditorialViewProvider');
    // Webview 准备就绪
    this.webViewService.registerMessageHandler(
      EnumMessageType.WebviewReady,
      () => {
        this.log.debug('收到 WebviewReady 事件', 'EditorialViewProvider');
        this.sendEditorialInitData();
      },
    );

    // Webview 日志上报
    this.webViewService.registerMessageHandler(
      EnumMessageType.WebviewLogReport,
      (message: WebViewMessage<any>) => {
        try {
          const payload = message.payload;
          const ctx = payload?.context || 'editorial-webview';
          // 仅在 error/warn 时保留，避免与 WebViewService 的通用消息日志重复
          if (payload?.level === 'error') {
            this.log.error(
              payload.message || '前端错误日志',
              ctx,
              payload?.data,
            );
          } else if (payload?.level === 'warn') {
            this.log.warn(
              payload.message || '前端警告日志',
              ctx,
              payload?.data,
            );
          }
        } catch {
          // ignore
        }
      },
    );

    // 保存评审意见
    this.webViewService.registerMessageHandler(
      EnumMessageType.SaveReviewComment,
      async (message: WebViewMessage<SaveReviewCommentPayload>) => {
        try {
          this.log.info('收到保存评审意见请求', 'EditorialViewProvider');
          const { comment, callbackId, formPrefs } = message.payload ?? {};

          // 1. 在调用处处理顺序：新建在前，已有在后
          const existing = this.stateService.getAddData();
          const merged = { ...(comment || {}), ...(existing || {}) };
          this.stateService.setAddData(merged);

          // 1.5 持久化添加表单偏好（扩展端 globalState，不依赖 webview dispose 时序）
          if (formPrefs && Object.keys(formPrefs).length > 0) {
            this.stateService.setLastAddFormPrefs(formPrefs);
          }

          // 2. 发送保存结果
          if (this._panel) {
            this._panel.webview.postMessage({
              type: callbackId,
              payload: { success: true },
            });
          }

          // 3. 关闭面板
          this._panel?.dispose();

          showInfo('评审意见保存成功');
          this.log.info('保存评审意见成功', 'EditorialViewProvider', {
            comment,
          });

          // 4. 通知侧边栏有新的评审意见被添加
          if (this.onNewCommentAdded) {
            this.onNewCommentAdded();
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          showError(`保存失败：${errorMessage}`);
          this.log.error('保存评审意见失败', 'EditorialViewProvider', {
            error: errorMessage,
          });

          if (this._panel) {
            this._panel.webview.postMessage({
              type: message.payload?.callbackId,
              payload: { success: false, error: errorMessage },
            });
          }
        }
      },
    );
  }

  /**
   * 刷新编辑面板数据
   *
   * 当主视图数据更新后，可以调用此方法刷新编辑面板的数据。
   * 主要用于确保编辑面板使用最新的列配置数据（从 StateService 缓存读取），
   * 并保持当前已选择的代码上下文（selectedTextInfo）不变。
   *
   * 注意：此方法会重新发送初始化数据，可能会重置编辑面板的状态。
   * 只在确实需要更新列配置时才调用。
   */
  public refreshEditorialData(): void {
    if (this._panel) {
      this.log.info('刷新编辑面板数据', 'EditorialViewProvider');
      this.sendEditorialInitData();
    } else {
      this.log.info('编辑面板未打开，跳过数据刷新', 'EditorialViewProvider');
    }
  }

  /**
   * addReview 路径刷新项目列表（受每日一次限制）
   */
  private async refreshProjectsForAddReview(): Promise<void> {
    const { projects, fetchedFromNetwork } =
      await ProjectListService.getInstance().ensureProjectsFresh('addReview');
    if (fetchedFromNetwork) {
      this.onProjectsUpdated?.(projects);
    }
  }

  /**
   * 发送 Editorial 页面初始化数据
   *
   * 向编辑面板发送初始化所需的所有数据，包括认证状态、选中文本信息、Git 信息等。
   * 列配置 columns 来源于 StateService 的缓存（由主视图在初始化或刷新时预拉取并持久化）。
   *
   * 执行流程：
   * 1. 检查面板和选中文本信息是否存在
   * 2. 获取当前认证状态
   * 3. 从 StateService 缓存获取列配置
   * 4. 发送统一的初始化数据到 WebView
   */
  private async sendEditorialInitData(): Promise<void> {
    if (!this._panel || !this.selectedTextInfo) {
      return;
    }

    // 获取认证状态
    const authState = this.stateService.getState();

    const projects = this.stateService.getProjects();
    const baseColumns = this.stateService.getColumnConfig() || [];
    const columns = injectProjectEnumValues(baseColumns, projects);
    const defaultProjectId = this.stateService.getCurrentProjectId();
    const lastAddFormPrefs = this.stateService.getLastAddFormPrefs();

    // 发送统一的初始化数据
    this._panel.webview.postMessage({
      type: EnumMessageType.EditorialInit,
      payload: {
        authState,
        selectedTextInfo: this.selectedTextInfo,
        gitInfo: this.selectedTextInfo.gitInfo || {
          repositoryUrl: null,
          branchName: null,
        },
        userDetail: this.selectedTextInfo.userDetail,
        columns,
        defaultProjectId,
        lastAddFormPrefs,
      },
    });
    this.log.debug('下发 Editorial 初始化数据', 'EditorialViewProvider', {
      authState,
      selectedTextInfo: this.selectedTextInfo,
      columns,
      defaultProjectId,
      lastAddFormPrefsFieldCount: lastAddFormPrefs
        ? Object.keys(lastAddFormPrefs).length
        : 0,
    });
  }
}
