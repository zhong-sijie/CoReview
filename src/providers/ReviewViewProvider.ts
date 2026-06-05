import * as vscode from 'vscode';
import { EnumLogLevel, EnumMessageType, EnumViews } from '../../shared/enums';
import {
  ColumnConfig,
  ExtensionMessage,
  LoginPayload,
  OpenFilePayload,
  ProjectOptionResponse,
  QueryContext,
  ReviewCommentItem,
  SubmitDataPayload,
  TestConnectionPayload,
  UpdateEditDataPayload,
  UpdateQueryContextPayload,
  WebViewMessage,
  WebviewLogPayload,
} from '../../shared/types';
import { AuthService } from '../services/AuthService';
import { DecorationService } from '../services/DecorationService';
import { LogService } from '../services/LogService';
import { ReminderService } from '../services/ReminderService';
import { StateService } from '../services/StateService';
import { TableService } from '../services/TableService';
import { WebViewService } from '../services/WebViewService';
import { showError, showInfo } from '../utils';
import { openFileAtLineRange } from '../utils/fileNavigation';

/**
 * 评审视图提供者
 *
 * 负责桥接 VS Code 扩展主机与 Webview 界面，作为控制器与服务层交互。
 * 主要功能包括创建并初始化 Webview、处理消息通信、管理表格数据等。
 *
 * 关键设计：
 * - 使用 WebViewService 封装 HTML 注入与消息总线注册/分发能力
 * - 通过 AuthService 处理鉴权相关操作
 * - 通过 StateService 管理状态持久化和变更通知
 * - 通过 TableService 处理表格数据操作
 *
 * 消息通信约定：
 * - Webview → Extension: GetAuthState / TestConnection / Login / GetInitialData 等
 * - Extension → Webview: AuthState / TableDataLoaded 等事件，以及异步操作的回调
 */
export class ReviewViewProvider implements vscode.WebviewViewProvider {
  /** 视图类型标识符，对应 EnumViews.MAIN_VIEW */
  public static readonly viewType = EnumViews.MAIN_VIEW;

  /** Webview 视图实例，用于显示主界面 */
  private _view?: vscode.WebviewView;

  /** Webview 服务实例，负责 HTML 注入和消息处理 */
  private webViewService: WebViewService;

  /** 认证服务实例，负责鉴权相关操作 */
  private authService: AuthService;

  /** 装饰服务 */
  private decorationService: DecorationService;

  /** 状态服务实例，负责状态管理和持久化 */
  private stateService: StateService;

  /** 表格服务实例，负责表格数据操作 */
  private tableService: TableService;

  /** 日志服务实例 */
  private log: LogService;

  /** 扩展加载阶段预取并缓存的初始表格数据 */
  private cachedInitialData?: {
    columns?: ColumnConfig[];
    projects?: ProjectOptionResponse[];
    comments?: ReviewCommentItem[];
    queryContext?: QueryContext | null;
  };

  /**
   * 通用的异步消息处理器
   *
   * 自动处理 try-catch 和回调，统一异步操作的错误处理和结果反馈。
   *
   * 执行流程：
   * 1. 提取消息中的回调标识符
   * 2. 执行异步业务处理函数
   * 3. 成功时设置 success 为 true
   * 4. 失败时捕获错误并显示错误提示
   * 5. 无论成功失败都执行回调，向 Webview 发送结果
   *
   * @param message 来自 Webview 的原始消息，其中 payload.callbackId 为一次性回调标识
   * @param asyncHandler 实际业务处理函数，返回 Promise
   */
  private async handleAsyncMessage(
    message: any,
    asyncHandler: () => Promise<void>,
  ): Promise<void> {
    const { callbackId } = message.payload ?? {};

    let success = false;
    let errorMessage: string | undefined;
    try {
      await asyncHandler();
      success = true;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      showError(errorMessage);
    } finally {
      // 无论成功失败都执行回调
      if (callbackId && this._view) {
        this._view.webview.postMessage({
          type: callbackId,
          payload: { success, error: errorMessage },
        });
      }
    }
  }

  /**
   * 构造函数
   *
   * 初始化评审视图提供者，设置依赖服务和消息处理器。
   * 初始化内容包括 Webview 容器服务、鉴权服务、状态管理服务等。
   */
  constructor(
    private readonly _extensionUri: vscode.Uri,
    decorationService: DecorationService,
  ) {
    this.webViewService = new WebViewService('review');
    this.decorationService = decorationService;
    this.authService = AuthService.getInstance();
    this.stateService = StateService.getInstance();
    this.tableService = TableService.getInstance();
    this.log = LogService.getInstance();
    this.setupMessageHandlers();
    void this.prefetchInitialDataAndApplyDecorations();
    this.log.info('初始化评审视图提供者', 'ReviewViewProvider');
  }

  /** 登出时清除内存缓存 */
  public clearInitialCache(): void {
    this.cachedInitialData = undefined;
  }

  /**
   * 预取初始数据并应用装饰
   *
   * 从状态判断登录态，登录后拉取列/项目/评论/上下文，
   * 缓存结果并构建/应用装饰。
   * 纯函数化封装，便于复用与单元测试。
   */
  private async prefetchInitialDataAndApplyDecorations(): Promise<void> {
    try {
      await this.stateService.whenCredentialsReady();
      const state = this.stateService.getState();
      if (!state.loggedIn || !state.serverUrl) {
        return;
      }
      this.log.info('预取初始数据并应用装饰', 'ReviewViewProvider');
      const data = await this.tableService.loadGetInitialTable();
      this.cachedInitialData = data;
      this.rebuildAndApplyDecorations();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      this.log.warn('预取初始数据失败', 'ReviewViewProvider', {
        error: errorMessage,
      });
    }
  }

  /**
   * 解析并初始化 Webview 视图
   *
   * VS Code 扩展生命周期方法，当 Webview 视图被激活时调用。
   * 负责配置 Webview 选项、注入 HTML 内容、设置消息监听器等。
   *
   * 执行流程：
   * 1. 配置 webview 选项（启用脚本、限制资源访问）
   * 2. 注入前端页面 HTML
   * 3. 设置消息监听器
   * 4. 等待 WebviewReady 后发送初始数据
   *
   * @param webviewView 要初始化的 Webview 视图实例
   */
  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    // 1) 配置 webview 选项
    // - enableScripts: 允许 Webview 内执行脚本
    // - localResourceRoots: 限制可加载的本地资源根（提高安全性）
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // 2) 注入前端页面 HTML（通常为打包后的 index.html + 资源）
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    this.log.debug('注入主视图 HTML 完成', 'ReviewViewProvider');

    // 3) 设置消息监听器: 接收 Webview 发来的 postMessage 并分发至已注册的处理器
    webviewView.webview.onDidReceiveMessage(
      message => {
        this.log.debug('收到 Webview 消息', 'ReviewViewProvider', {
          type: message?.type,
        });
        this.handleWebViewMessage(message);
      },
      undefined,
      [],
    );

    // 4) 初始数据将在收到 WebviewReady 后发送
  }

  /**
   * 重新加载整个 Webview
   *
   * 重新注入 HTML 内容，用于刷新界面显示；数据发送改为在 WebviewReady 之后触发。
   * 供命令调用，用于刷新界面内容。数据优先使用 cachedInitialData，
   * 若无缓存再调用 TableService 拉取，并在 sendColumnConfig 中增加轻微延迟确保前端已挂载监听。
   *
   * 执行流程：
   * 1. 检查视图是否存在
   * 2. 重新注入 HTML 内容
   * 3. 初始数据等待 WebviewReady 后再发送
   */
  public reloadWebview(): void {
    if (!this._view) {
      return;
    }
    this.log.info('重新加载 Webview 内容', 'ReviewViewProvider');
    // 重新注入 HTML
    this._view.webview.html = this.getHtmlForWebview(this._view.webview);
    // 初始数据等待 WebviewReady 后再发送
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
        app: 'Sidebar',
        title: 'CoReview Sidebar',
      },
    );
    return html;
  }

  /**
   * 注册来自 Webview 的消息处理器
   *
   * 为每种消息类型注册对应的处理函数，实现双向通信。
   * 包括鉴权、数据获取、状态更新等各种业务操作。
   */
  private setupMessageHandlers(): void {
    this.log.debug('注册主视图消息处理器', 'ReviewViewProvider');
    // Webview 挂载完成后再发送初始数据（优先使用缓存）
    this.webViewService.registerMessageHandler(
      EnumMessageType.WebviewReady,
      () => {
        this.log.debug('收到 WebviewReady 事件', 'ReviewViewProvider');
        this.sendInitialData();
      },
    );

    // Webview 日志上报
    this.webViewService.registerMessageHandler(
      EnumMessageType.WebviewLogReport,
      (message: ExtensionMessage<WebviewLogPayload>) => {
        try {
          const payload = message.payload;
          const ctx = payload?.context || 'webview';
          // 仅在 error/warn 时保留，避免与 WebViewService 的通用消息日志重复
          if (payload?.level === EnumLogLevel.ERROR) {
            this.log.error(
              payload.message || '前端错误日志',
              ctx,
              payload?.data,
            );
          } else if (payload?.level === EnumLogLevel.WARN) {
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

    // 获取鉴权状态
    // 输入: 无（仅触发）
    // 行为: 读取 authService.getState() 并通过 AuthState 事件回发至 Webview
    this.webViewService.registerMessageHandler(
      EnumMessageType.GetAuthState,
      () => {
        this.sendAuthState();
      },
    );

    // 连接测试
    this.webViewService.registerMessageHandler(
      EnumMessageType.TestConnection,
      async (message: WebViewMessage<TestConnectionPayload>) => {
        const { serverUrl } = message.payload ?? {}; // Webview 传入的服务器地址（字符串）

        await this.handleAsyncMessage(message, async () => {
          this.log.debug('开始测试连接', 'ReviewViewProvider', { serverUrl });
          // 1) 调用鉴权服务进行连接测试（内部会校验 URL、请求 /client/system/checkConnection）
          await this.authService.loadTestConnection(serverUrl);
          this.stateService.setLoggedIn(false);
          this.sendAuthState();
          showInfo('连接测试成功');
          this.log.info('连接测试成功', 'ReviewViewProvider');
        });
      },
    );

    // 登录
    this.webViewService.registerMessageHandler(
      EnumMessageType.Login,
      async (message: WebViewMessage<LoginPayload>) => {
        const { username, password } = message.payload ?? {}; // Webview 传入的用户名/明文密码

        await this.handleAsyncMessage(message, async () => {
          this.log.debug('开始登录', 'ReviewViewProvider', { username });
          // 1) 发起登录: 内部会对密码做 MD5，并调用 /client/system/checkAuth
          await this.authService.loadLogin(username, password);
          // 2) 登录成功: AuthService.loadLogin 内部已设置 loggedIn=true，此处仅推送最新鉴权状态
          this.sendAuthState(); // state 中不包含敏感 token，仅暴露必要信息
          // 3) 登录成功后获取表格初始化数据（列配置 + 项目列表）
          const { columns, projects, comments, queryContext } =
            await this.tableService.loadGetInitialTable();

          // 刷新缓存并下发
          this.cachedInitialData = {
            columns,
            projects,
            comments,
            queryContext,
          };
          this.sendColumnConfig(columns, projects, comments, queryContext);

          showInfo('登录成功');
          this.log.info('登录成功', 'ReviewViewProvider');

          // 4) 登录成功后触发即时提醒（允许当日多次），同时避免当日每日提醒重复
          ReminderService.getInstance().notifyOnLogin();
        });
      },
    );

    // 获取初始数据（前端主动请求）：优先使用缓存，连接状态异常时也返回缓存，避免空白页
    this.webViewService.registerMessageHandler(
      EnumMessageType.GetInitialData,
      async message => {
        await this.handleAsyncMessage(message, async () => {
          this.log.info('收到 GetInitialData 请求', 'ReviewViewProvider');
          // 未登录或连接未就绪时，直接返回空数据，避免触发需要鉴权的请求
          const state = this.stateService.getState();
          this.log.info('GetInitialData 请求状态检查', 'ReviewViewProvider', {
            loggedIn: state.loggedIn,
            connectionOk: state.connectionOk,
            serverUrl: !!this.stateService.getServerUrl(),
            hasCachedData: !!this.cachedInitialData,
          });

          if (this.cachedInitialData && state.loggedIn) {
            this.log.info('有缓存数据，发送缓存数据', 'ReviewViewProvider');
            const cached = this.cachedInitialData;
            this.sendColumnConfig(
              cached.columns,
              cached.projects,
              cached.comments,
              cached.queryContext,
            );
            return;
          }

          // 没有缓存数据且状态检查失败时，发送空数据
          if (
            !state.loggedIn ||
            !state.connectionOk ||
            !this.stateService.getServerUrl()
          ) {
            this.log.info(
              '状态检查失败且无缓存数据，发送空数据',
              'ReviewViewProvider',
            );
            this.sendColumnConfig([], [], [], null);
            return;
          }

          // 无缓存则从服务器获取
          this.log.info(
            '无缓存数据，从服务器获取数据响应 GetInitialData 请求',
            'ReviewViewProvider',
          );
          const { columns, projects, comments, queryContext } =
            await this.tableService.loadGetInitialTable();
          // 缓存数据
          this.cachedInitialData = {
            columns,
            projects,
            comments,
            queryContext,
          };
          // 将初始化数据发送给 Webview
          this.sendColumnConfig(columns, projects, comments, queryContext);
        });
      },
    );

    // 更新编辑数据和新增数据
    this.webViewService.registerMessageHandler(
      EnumMessageType.UpdateEditData,
      async (message: WebViewMessage<UpdateEditDataPayload>) => {
        const { editData, addData } = message.payload ?? {}; // Webview 传入的完整编辑数据和新增数据

        await this.handleAsyncMessage(message, async () => {
          this.log.debug('保存编辑与新增数据', 'ReviewViewProvider', {
            editData,
            addData,
          });
          // 调用表格服务保存编辑数据和新增数据
          await this.tableService.saveData(editData, addData);
          // 保存后立即重建装饰
          this.rebuildAndApplyDecorations();
        });
      },
    );

    // 提交数据（可根据后端接口进一步实现）
    this.webViewService.registerMessageHandler(
      EnumMessageType.SubmitData,
      async (message: WebViewMessage<SubmitDataPayload>) => {
        const { submitData } = message.payload ?? {};
        await this.handleAsyncMessage(message, async () => {
          this.log.debug('提交数据', 'ReviewViewProvider', {
            items: submitData,
          });
          // 1) 调用提交接口
          const result = await this.tableService.loadCommitComments({
            comments: submitData || [],
          });
          if (!result.success) {
            const errorMessage = result.errDesc ?? '提交失败';
            showError(`提交失败：${errorMessage}`);
            this.log.warn('提交失败', 'ReviewViewProvider', {
              error: errorMessage,
              failedIds: result.failedIds,
            });
            throw new Error(errorMessage);
          }

          showInfo('提交完成');
          this.log.info('提交完成', 'ReviewViewProvider');

          const { comments } = await this.tableService.loadQueryComments({
            projectId: this.stateService.getCurrentProjectId(),
            type: this.stateService.getCurrentFilterType(),
          });

          if (this.cachedInitialData) {
            this.cachedInitialData = { ...this.cachedInitialData, comments };
          }

          if (this._view) {
            this._view.webview.postMessage({
              type: EnumMessageType.CommentsLoaded,
              payload: { comments },
            });
          }

          this.rebuildAndApplyDecorations();
        });
      },
    );

    // 同步查询上下文（项目与状态）
    this.webViewService.registerMessageHandler(
      EnumMessageType.UpdateQueryContext,
      async (message: WebViewMessage<UpdateQueryContextPayload>) => {
        await this.handleAsyncMessage(message, async () => {
          const { projectId, type } = message.payload ?? {};
          this.log.debug('更新查询上下文', 'ReviewViewProvider', {
            projectId,
            type,
          });
          this.stateService.setQueryContext({
            projectId: projectId,
            filterType: type,
          });
        });
      },
    );

    // 按条件查询评论
    this.webViewService.registerMessageHandler(
      EnumMessageType.QueryComments,
      async (message: WebViewMessage<UpdateQueryContextPayload>) => {
        const { projectId, type } = message.payload ?? {};
        await this.handleAsyncMessage(message, async () => {
          this.log.debug('按条件查询评论', 'ReviewViewProvider', {
            projectId,
            type,
          });
          const { comments } = await this.tableService.loadQueryComments({
            projectId,
            type,
          } as any);
          if (this._view) {
            this._view.webview.postMessage({
              type: EnumMessageType.CommentsLoaded,
              payload: { comments },
            });
          }
        });
      },
    );

    // 打开文件并跳转到指定行号
    this.webViewService.registerMessageHandler(
      EnumMessageType.OpenFile,
      async (message: WebViewMessage<OpenFilePayload>) => {
        const { filePath, lineRange } = message.payload ?? {};

        try {
          this.log.debug('打开文件请求', 'ReviewViewProvider', {
            filePath,
            lineRange,
          });
          await openFileAtLineRange(filePath, lineRange);
          this.log.info('打开文件并定位完成', 'ReviewViewProvider');
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          showError(`打开文件失败: ${errorMessage}`);
          this.log.error('打开文件失败', 'ReviewViewProvider', {
            error: errorMessage,
          });
        }
      },
    );
  }

  /**
   * 将 Webview 消息分发给已注册的处理器
   *
   * 根据消息类型查找对应的处理函数并执行。
   * 这是消息处理的核心分发机制。
   *
   * @param message 来自 Webview 的消息对象
   */
  private handleWebViewMessage(message: any): void {
    const handler = this.webViewService.messageHandlers.get(message.type);
    if (handler) {
      handler(message);
    }
  }

  /**
   * 重新构建并应用装饰
   *
   * 基于当前缓存的评论 + 已持久化的编辑数据 + 新增数据进行合并，
   * 然后重建 hover/下划线/overviewRuler 装饰。
   */
  private rebuildAndApplyDecorations(): void {
    const baseComments = this.cachedInitialData?.comments ?? [];
    const edit = this.tableService.getPersistedEditData() || undefined;
    const mergedMap = new Map<string, ReviewCommentItem>();
    for (const c of baseComments) {
      mergedMap.set(c.id, c);
    }
    if (edit) {
      for (const id of Object.keys(edit)) {
        mergedMap.set(id, edit[id]);
      }
    }
    const items = this.decorationService.computeDecorationItems(
      Array.from(mergedMap.values()),
      this.stateService.getAddData(),
    );
    this.decorationService.updateUnderlineDecorations(items);
  }

  private sendAuthState(): void {
    if (this._view) {
      const state = this.stateService.getState();

      // 更新 VS Code 上下文键
      vscode.commands.executeCommand(
        'setContext',
        'coreview.loggedIn',
        state.loggedIn,
      );

      // Extension → Webview: 通过 AuthState 事件携带最新鉴权状态
      this._view.webview.postMessage({
        type: EnumMessageType.AuthState,
        payload: state,
      });
    }
  }

  /**
   * 发送表格初始化数据给 Webview
   *
   * 包含列配置、项目列表与初始评论等完整数据。
   * 同时包含持久化的编辑数据和新增的评审意见。
   *
   * 执行流程：
   * 1. 检查视图是否存在
   * 2. 获取持久化的编辑数据
   * 3. 获取新增的评审意见
   * 4. 通过 TableDataLoaded 事件发送完整数据到 Webview
   *
   * @param columns 列配置数据
   * @param projects 项目列表数据
   * @param comments 评论列表数据
   * @param queryContext 查询上下文
   */
  /** 项目列表以 StateService 持久化缓存为准，避免与 cachedInitialData 分叉 */
  private resolveProjects(
    fallback?: ProjectOptionResponse[],
  ): ProjectOptionResponse[] {
    const stored = this.stateService.getProjects();
    if (stored.length > 0) {
      return stored;
    }
    return fallback ?? [];
  }

  /** 同步内存初始数据缓存中的项目列表 */
  public patchCachedProjects(projects: ProjectOptionResponse[]): void {
    if (this.cachedInitialData) {
      this.cachedInitialData = { ...this.cachedInitialData, projects };
    }
  }

  private sendColumnConfig(
    columns?: ColumnConfig[],
    projects?: ProjectOptionResponse[],
    comments?: ReviewCommentItem[],
    queryContext?: QueryContext | null,
  ): void {
    if (this._view) {
      // 获取持久化的编辑数据
      const persistedEditData = this.tableService.getPersistedEditData();

      // 获取新增的评审意见
      const addData = this.stateService.getAddData();

      const resolvedProjects = this.resolveProjects(projects);

      const payload = {
        columns,
        projects: resolvedProjects,
        comments,
        editData: persistedEditData,
        queryContext,
        addData,
        layout: this.stateService.getLayout(),
      };

      this.log.info('发送表格数据到 Webview', 'ReviewViewProvider', {
        columnsCount: columns?.length || 0,
        projectsCount: resolvedProjects.length,
        commentsCount: comments?.length || 0,
        hasEditData: !!persistedEditData,
        hasAddData: !!addData,
      });

      this._view.webview.postMessage({
        type: EnumMessageType.TableDataLoaded,
        payload,
      });

      this.rebuildAndApplyDecorations();
    } else {
      this.log.warn('Webview 视图不存在，无法发送数据', 'ReviewViewProvider');
    }
  }

  /**
   * 对外公开：广播当前鉴权状态
   *
   * 供外部调用，用于主动推送鉴权状态变更。
   * 当其他组件需要通知鉴权状态变化时使用。
   */
  public broadcastAuthState(): void {
    this.sendAuthState();
  }

  /**
   * 对外公开：广播新增评审意见事件
   *
   * 当有新的评审意见被添加时，通知前端刷新数据。
   * 用于保持主视图和编辑视图之间的数据同步。
   *
   * 执行流程：
   * 1. 检查视图是否存在
   * 2. 获取新增的评审意见
   * 3. 发送新增评审意见事件到 Webview
   */
  public broadcastNewReviewComment(): void {
    if (this._view) {
      // 获取新增的评审意见
      const addData = this.stateService.getAddData();

      // 发送新增评审意见事件
      this._view.webview.postMessage({
        type: EnumMessageType.NewReviewCommentAdded,
        payload: {
          addData,
        },
      });
    }
    // 同步重建装饰，确保无需打开侧边栏也能看到新建评审的下划线与 hover
    this.rebuildAndApplyDecorations();
  }

  /**
   * 对外公开：广播项目列表更新
   *
   * 当项目列表从网络刷新后，通知 Sidebar 同步更新下拉选项。
   */
  public broadcastProjectsUpdated(projects: ProjectOptionResponse[]): void {
    this.patchCachedProjects(projects);
    this._view?.webview.postMessage({
      type: EnumMessageType.ProjectsUpdated,
      payload: { projects },
    });
  }

  /**
   * 首次渲染时发送初始数据
   *
   * 仅下发鉴权状态；列配置在登录成功后再拉取。
   * 这是 Webview 初始化时的数据发送策略。
   *
   * 执行流程：
   * 1. 发送鉴权状态
   * 2. 如果已登录，异步获取并发送表格初始化数据
   */
  private sendInitialData(): void {
    void this.stateService.whenCredentialsReady().then(() => {
      this.doSendInitialData();
    });
  }

  private doSendInitialData(): void {
    this.log.info('开始发送初始数据', 'ReviewViewProvider');
    // 仅下发鉴权状态；列配置在登录成功后再拉取
    this.sendAuthState();

    // 发送当前布局状态
    const currentLayout = this.stateService.getLayout();
    if (this._view) {
      this._view.webview.postMessage({
        type: EnumMessageType.LayoutChanged,
        payload: {
          layout: currentLayout,
        },
      });
      this.log.info('发送初始布局状态', 'ReviewViewProvider', {
        layout: currentLayout,
      });
    }
    const authState = this.stateService.getState();
    if (!authState.loggedIn) {
      this.log.info('用户未登录，跳过数据发送', 'ReviewViewProvider');
      return;
    }

    // 优先使用扩展启动时预取的缓存
    if (this.cachedInitialData) {
      this.log.info('使用缓存数据发送', 'ReviewViewProvider', {
        columnsCount: this.cachedInitialData.columns?.length || 0,
        projectsCount: this.cachedInitialData.projects?.length || 0,
        commentsCount: this.cachedInitialData.comments?.length || 0,
      });
      const cached = this.cachedInitialData;
      const columns = cached.columns;
      const projects = cached.projects;
      const comments = cached.comments;
      const queryContext = cached.queryContext;
      this.sendColumnConfig(columns, projects, comments, queryContext);
      return;
    }

    this.log.info('缓存为空，从服务器获取数据', 'ReviewViewProvider');
    void this.tableService
      .loadGetInitialTable()
      .then(data => {
        this.cachedInitialData = data;
        this.sendColumnConfig(
          data.columns,
          data.projects,
          data.comments,
          data.queryContext,
        );
      })
      .catch(error => {
        this.log.error('从服务器获取数据失败', 'ReviewViewProvider', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  public updateLayout(layout: 'table' | 'card'): void {
    if (this._view) {
      this._view.webview.postMessage({
        type: EnumMessageType.LayoutChanged,
        payload: { layout },
      });
      this.log.info('发送布局更新消息', 'ReviewViewProvider', { layout });
    } else {
      this.log.warn(
        '无法发送布局更新消息：Webview 未初始化',
        'ReviewViewProvider',
        { layout },
      );
    }
  }
}
