import * as path from 'path';
import * as vscode from 'vscode';
import {
  EnumConfirmResult,
  EnumMessageType,
  EnumViews,
} from '../../shared/enums';
import {
  ColumnConfig,
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
} from '../../shared/types';
import { AuthService } from '../services/AuthService';
import { StateService } from '../services/StateService';
import { TableService } from '../services/TableService';
import { WebViewService } from '../services/WebViewService';
import { WebViewServiceFactory } from '../services/WebViewServiceFactory';
import { showError, showInfo } from '../utils';

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
/**
 * 装饰状态枚举（仅用于前端展示规则）
 */

/** 装饰项类型，统一用于下划线与 hover 的应用 */
type DecorationItem = {
  filePath: string;
  lineRange: string;
  hover?: string;
  status?: EnumConfirmResult;
};

export class ReviewViewProvider implements vscode.WebviewViewProvider {
  /** 视图类型标识符，对应 EnumViews.MAIN_VIEW */
  public static readonly viewType = EnumViews.MAIN_VIEW;

  /** Webview 视图实例，用于显示主界面 */
  private _view?: vscode.WebviewView;

  /** Webview 服务实例，负责 HTML 注入和消息处理 */
  private webViewService: WebViewService;

  /** 认证服务实例，负责鉴权相关操作 */
  private authService: AuthService;

  /** 状态服务实例，负责状态管理和持久化 */
  private stateService: StateService;

  /** 统一的下划线装饰类型（包含 overviewRuler 标记） */
  private underlineDecoration?: vscode.TextEditorDecorationType;
  private underlineDecorationAmber?: vscode.TextEditorDecorationType;

  /** 最近一次从 Webview 收到的装饰项，用于在编辑器切换时重放 */
  private lastDecorationItems: DecorationItem[] = [];

  /** 表格服务实例，负责表格数据操作 */
  private tableService: TableService;

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
  constructor(private readonly _extensionUri: vscode.Uri) {
    this.webViewService = WebViewServiceFactory.createService('review');
    this.authService = AuthService.getInstance();
    this.stateService = StateService.getInstance();
    this.tableService = TableService.getInstance();
    this.setupMessageHandlers();
    // 扩展加载时预取初始化数据（不依赖页面主动请求）
    void this.prefetchInitialDataAndApplyDecorations();

    // 监听编辑器变化，重新应用装饰
    this.setupEditorDecorationListeners();
  }

  /**
   * 如果存在缓存的装饰项，则应用到当前可见编辑器
   */
  private applyLastDecorationsIfAny(): void {
    if (this.lastDecorationItems.length === 0) {
      return;
    }
    this.updateUnderlineDecorations(
      this.lastDecorationItems as DecorationItem[],
    );
  }

  /**
   * 注册编辑器相关的装饰监听，在编辑器切换或可见编辑器变化时重放装饰
   */
  private setupEditorDecorationListeners(): void {
    vscode.window.onDidChangeActiveTextEditor(() => {
      this.applyLastDecorationsIfAny();
    });
    vscode.window.onDidChangeVisibleTextEditors(() => {
      this.applyLastDecorationsIfAny();
    });
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
      const state = this.stateService.getState();
      if (!state.loggedIn) {
        return;
      }
      const { columns, projects, comments, queryContext } =
        await this.tableService.loadGetInitialTable();
      this.cachedInitialData = { columns, projects, comments, queryContext };
      const items = this.buildDecorationItemsIncludingAddData(comments);
      this.updateUnderlineDecorations(items);
    } catch {
      // ignore
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

    // 3) 设置消息监听器: 接收 Webview 发来的 postMessage 并分发至已注册的处理器
    webviewView.webview.onDidReceiveMessage(
      message => {
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
   * 重新注入 HTML 内容，用于刷新界面显示。
   * 供命令调用，用于刷新界面内容。
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
    return this.webViewService.getWebViewContent(webview, this._extensionUri, {
      app: 'Sidebar',
      title: 'CoReview Sidebar',
    });
  }

  /**
   * 注册来自 Webview 的消息处理器
   *
   * 为每种消息类型注册对应的处理函数，实现双向通信。
   * 包括鉴权、数据获取、状态更新等各种业务操作。
   */
  private setupMessageHandlers(): void {
    // Webview 挂载完成后再发送初始数据
    this.webViewService.registerMessageHandler(
      EnumMessageType.WebviewReady,
      () => {
        this.sendInitialData();
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
          // 1) 调用鉴权服务进行连接测试（内部会校验 URL、请求 /client/system/checkConnection）
          await this.authService.loadTestConnection(serverUrl);
          // 2) 连接成功: 允许编辑账号密码，并重置登录态
          this.stateService.setConnectionOk(true);
          this.stateService.setLoggedIn(false);
          // 3) 将最新鉴权状态回传给 Webview（包含 serverUrl/connectionOk/loggedIn 等）
          this.sendAuthState();
          showInfo('连接测试成功');
        });
      },
    );

    // 登录
    this.webViewService.registerMessageHandler(
      EnumMessageType.Login,
      async (message: WebViewMessage<LoginPayload>) => {
        const { username, password } = message.payload ?? {}; // Webview 传入的用户名/明文密码

        await this.handleAsyncMessage(message, async () => {
          // 1) 发起登录: 内部会对密码做 MD5，并调用 /server/login/doLogin
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
        });
      },
    );

    // 获取初始数据
    this.webViewService.registerMessageHandler(
      EnumMessageType.GetInitialData,
      async message => {
        await this.handleAsyncMessage(message, async () => {
          // 1) 调用表格服务并行获取列配置与项目
          const { columns, projects, comments, queryContext } =
            await this.tableService.loadGetInitialTable();
          // 2) 将初始化数据发送给 Webview
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
          // 1) 调用提交接口
          const result = await this.tableService.loadCommitComments({
            comments: submitData || [],
          });
          if (result.success) {
            showInfo('提交完成');
          } else {
            showError(`提交失败：${result.errDesc ?? '未知错误'}`);
          }
          // 2) 提交成功后按当前上下文重新查询
          const { comments } = await this.tableService.loadQueryComments({
            projectId: this.stateService.getCurrentProjectId(),
            type: this.stateService.getCurrentFilterType(),
          });

          if (this._view) {
            this._view.webview.postMessage({
              type: EnumMessageType.CommentsLoaded,
              payload: { comments },
            });
          }

          // 查询完成后，直接在扩展端应用装饰（包含编辑与新增）
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
          // 打开文件
          const document = await this.openFileWithFallback(filePath);

          // 显示文件
          const editor = await vscode.window.showTextDocument(document, {
            preview: false,
            viewColumn: vscode.ViewColumn.Active,
          });

          // 跳转到指定行号
          await this.jumpToLineRange(editor, lineRange);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          showError(`打开文件失败: ${errorMessage}`);
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
    const mergedComments = this.computeMergedComments(
      baseComments,
      this.tableService.getPersistedEditData() || undefined,
    );
    const items = this.computeDecorationItems(mergedComments);
    this.updateUnderlineDecorations(items);
  }

  /**
   * 从评论数据构建装饰项
   */
  private buildDecorationEntriesFromComments(
    comments: ReviewCommentItem[],
  ): DecorationItem[] {
    const items: DecorationItem[] = [];

    // 小工具：优先取 showName，其次取 value，再回退空字符串
    const getFieldText = (fv: any): string => {
      const val = fv?.showName ?? fv?.value ?? '';
      return typeof val === 'string' ? val.trim() : String(val ?? '');
    };

    const buildHover = (c: ReviewCommentItem): string => {
      const {
        identifier,
        type,
        priority,
        module: moduleField,
        comment,
        confirmNotes,
        reviewer,
        realConfirmer,
        assignConfirmer,
      } = c.values ?? {};

      const id = identifier?.value ?? '';
      const typeText = getFieldText(type);
      const priorityText = getFieldText(priority);
      const moduleName = getFieldText(moduleField);
      const commentText = getFieldText(comment);
      const confirmNotesText = getFieldText(confirmNotes);
      const reviewerText = getFieldText(reviewer);
      const confirmerText =
        getFieldText(realConfirmer) || getFieldText(assignConfirmer);

      const headerParts = [
        id ? `ID: ${id}` : '',
        typeText,
        priorityText,
        moduleName,
      ].filter(Boolean);
      const header = headerParts.length ? `**${headerParts.join(' · ')}**` : '';

      const lines: string[] = [];
      if (header) {
        lines.push(header);
      }
      lines.push(`检视意见: ${commentText || '(无检视意见)'}`);
      if (reviewerText) {
        lines.push(`检视人员: ${reviewerText}`);
      }
      if (confirmNotesText) {
        lines.push(`确认说明: ${confirmNotesText}`);
      }
      if (confirmerText) {
        lines.push(`确认人员: ${confirmerText}`);
      }
      return lines.join('\n\n');
    };

    for (const c of comments ?? []) {
      const filePath = getFieldText((c.values as any)?.filePath);
      const lineRange = getFieldText((c.values as any)?.lineRange);
      if (!filePath || !lineRange) {
        continue;
      }

      items.push({
        filePath,
        lineRange,
        hover: buildHover(c),
        status: c.values?.confirmResult?.value,
      });
    }

    return items;
  }

  /**
   * 从评论与新增记录（addData）联合构建装饰项
   */
  private buildDecorationItemsIncludingAddData(
    comments?: ReviewCommentItem[] | null,
  ): DecorationItem[] {
    return this.computeDecorationItems(comments);
  }

  private computeMergedComments(
    base: ReviewCommentItem[],
    edit?: Record<string, ReviewCommentItem>,
  ): ReviewCommentItem[] {
    const mergedMap = new Map<string, ReviewCommentItem>();
    for (const c of base ?? []) {
      mergedMap.set(c.id, c);
    }
    if (edit) {
      for (const id of Object.keys(edit)) {
        mergedMap.set(id, edit[id]);
      }
    }
    return Array.from(mergedMap.values());
  }

  private computeDecorationItems(
    comments?: ReviewCommentItem[] | null,
  ): DecorationItem[] {
    const list: ReviewCommentItem[] = [];
    if (comments && comments.length > 0) {
      list.push(...comments);
    }
    const addData = this.stateService.getAddData() as
      | Record<string, ReviewCommentItem>
      | undefined;
    if (addData) {
      for (const key of Object.keys(addData)) {
        const item = addData[key];
        if (item) {
          list.push(item);
        }
      }
    }
    return this.buildDecorationEntriesFromComments(list);
  }

  /**
   * 发送当前鉴权状态给 Webview
   *
   * 同时更新 VS Code 上下文键，用于控制命令的可用性。
   * 当鉴权状态发生变化时调用此方法。
   *
   * 执行流程：
   * 1. 检查视图是否存在
   * 2. 获取当前应用状态
   * 3. 更新 VS Code 上下文键
   * 4. 通过 AuthState 事件发送鉴权状态到 Webview
   */
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

      // Extension → Webview: 通过 TableDataLoaded 事件携带初始化数据
      this._view.webview.postMessage({
        type: EnumMessageType.TableDataLoaded,
        payload: {
          columns,
          projects,
          comments,
          editData: persistedEditData,
          queryContext,
          addData, // 新增：包含新增的评审意见
        },
      });

      // 直接在扩展端应用装饰（包含新增数据）
      const items = this.buildDecorationItemsIncludingAddData(comments);
      this.updateUnderlineDecorations(items);
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
    // 仅下发鉴权状态；列配置在登录成功后再拉取
    this.sendAuthState();
    const authState = this.stateService.getState();
    if (!authState.loggedIn) {
      return;
    }

    // 优先使用扩展启动时预取的缓存
    if (this.cachedInitialData) {
      const cached = this.cachedInitialData;
      const columns = cached.columns;
      const projects = cached.projects;
      const comments = cached.comments;
      const queryContext = cached.queryContext;
      this.sendColumnConfig(columns, projects, comments, queryContext);
      const items = this.buildDecorationItemsIncludingAddData(comments);
      this.updateUnderlineDecorations(items);
      return;
    }

    // 无缓存则按老流程拉取一次并缓存
    this.tableService
      .loadGetInitialTable()
      .then(({ columns, projects, comments, queryContext }) => {
        this.cachedInitialData = { columns, projects, comments, queryContext };
        this.sendColumnConfig(columns, projects, comments, queryContext);
        const items = this.buildDecorationItemsIncludingAddData(comments);
        this.updateUnderlineDecorations(items);
      });
  }

  /**
   * 打开文件，支持多种路径格式的智能回退
   *
   * 自动处理相对路径和绝对路径，尝试多种可能的路径组合来找到文件。
   * 支持工作区相对路径、绝对路径等多种格式。
   *
   * @param filePath 文件路径，可以是相对路径或绝对路径
   * @returns 成功打开的文件文档对象
   * @throws 当所有路径尝试都失败时抛出错误
   */
  private async openFileWithFallback(
    filePath: string,
  ): Promise<vscode.TextDocument> {
    if (
      vscode.workspace.workspaceFolders &&
      vscode.workspace.workspaceFolders.length > 0
    ) {
      // 有工作区文件夹，尝试解析相对路径
      const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

      // 尝试多种可能的路径组合
      const possiblePaths = [
        filePath, // 原始路径
        path.join(workspaceRoot, filePath), // 工作区根目录 + 相对路径
        path.resolve(workspaceRoot, filePath), // 解析后的绝对路径
      ];

      // 尝试打开文件，直到成功
      for (const testPath of possiblePaths) {
        try {
          const uri = vscode.Uri.file(testPath);
          return await vscode.workspace.openTextDocument(uri);
        } catch {
          // 继续尝试下一个路径
          continue;
        }
      }

      // 所有路径都失败
      throw new Error(`无法找到文件，尝试的路径: ${possiblePaths.join(', ')}`);
    } else {
      // 没有工作区，直接尝试原始路径
      const uri = vscode.Uri.file(filePath);
      return await vscode.workspace.openTextDocument(uri);
    }
  }

  /**
   * 跳转到指定的行号范围
   *
   * 解析行号范围字符串，支持多段范围格式，并自动设置选择范围和滚动位置。
   * 支持的行号格式：单行 "10"、范围 "4 ~ 8"、多段 "4 ~ 8; 10 ~ 20; 30 ~ 50"
   *
   * @param editor 要操作的文本编辑器
   * @param lineRange 行号范围字符串
   */
  private async jumpToLineRange(
    editor: vscode.TextEditor,
    lineRange: string,
  ): Promise<void> {
    const doc = editor.document;

    // 解析行号范围，支持多段范围如 "4 ~ 8; 10 ~ 20; 30 ~ 50"
    const segments = lineRange
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);

    if (segments.length === 0) {
      return;
    }

    const selections: vscode.Selection[] = [];

    for (const seg of segments) {
      // 1) 区间匹配：a ~ b 或 a ～ b
      let m = seg.match(/^(\d+)\s*[~～]\s*(\d+)$/);
      if (m) {
        let start = parseInt(m[1], 10);
        let end = parseInt(m[2], 10);
        if (Number.isNaN(start) || Number.isNaN(end)) {
          continue;
        }
        if (end < start) {
          [start, end] = [end, start];
        }

        // 转为 0-based 索引并做边界修正
        const startLine = Math.max(0, Math.min(doc.lineCount - 1, start - 1));
        const endLine = Math.max(0, Math.min(doc.lineCount - 1, end - 1));

        const startPos = new vscode.Position(startLine, 0);
        const endPos = doc.lineAt(endLine).range.end; // 覆盖到结束行末尾，确保包含该行
        selections.push(new vscode.Selection(startPos, endPos));
        continue;
      }

      // 2) 单行匹配：a
      m = seg.match(/^(\d+)$/);
      if (m) {
        const ln = parseInt(m[1], 10);
        if (Number.isNaN(ln)) {
          continue;
        }
        const line = Math.max(0, Math.min(doc.lineCount - 1, ln - 1));
        const startPos = new vscode.Position(line, 0);
        const endPos = doc.lineAt(line).range.end;
        selections.push(new vscode.Selection(startPos, endPos));
      }
    }

    if (selections.length === 0) {
      return;
    }

    // 设置多段选择
    editor.selections = selections;
    // 将视图滚动到第一段
    editor.revealRange(selections[0], vscode.TextEditorRevealType.InCenter);
  }

  /**
   * 将 "4 ~ 8; 10 ~ 12" 解析为 vscode.Range 数组（基于当前文档）
   */
  private parseRangesForDocument(
    doc: vscode.TextDocument,
    lineRange: string,
  ): vscode.Range[] {
    const segments = (lineRange || '')
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);

    const ranges: vscode.Range[] = [];
    for (const seg of segments) {
      let m = seg.match(/^(\d+)\s*[~～]\s*(\d+)$/);
      if (m) {
        let start = parseInt(m[1], 10);
        let end = parseInt(m[2], 10);
        if (Number.isNaN(start) || Number.isNaN(end)) {
          continue;
        }
        if (end < start) {
          [start, end] = [end, start];
        }
        const sLine = Math.max(0, Math.min(doc.lineCount - 1, start - 1));
        const eLine = Math.max(0, Math.min(doc.lineCount - 1, end - 1));
        const sPos = new vscode.Position(sLine, 0);
        const ePos = doc.lineAt(eLine).range.end;
        ranges.push(new vscode.Range(sPos, ePos));
        continue;
      }

      m = seg.match(/^(\d+)$/);
      if (m) {
        const ln = parseInt(m[1], 10);
        if (Number.isNaN(ln)) {
          continue;
        }
        const line = Math.max(0, Math.min(doc.lineCount - 1, ln - 1));
        const sPos = new vscode.Position(line, 0);
        const ePos = doc.lineAt(line).range.end;
        ranges.push(new vscode.Range(sPos, ePos));
      }
    }
    return ranges;
  }

  /**
   * 创建或获取下划线装饰类型（未确认状态）
   */
  private createOrGetUnderlineDecoration(): vscode.TextEditorDecorationType {
    if (!this.underlineDecoration) {
      this.underlineDecoration = vscode.window.createTextEditorDecorationType({
        textDecoration:
          'underline; text-decoration-color: var(--vscode-editorInfo-foreground);',
        overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
        overviewRulerLane: vscode.OverviewRulerLane.Right,
      });
    }
    return this.underlineDecoration;
  }

  /**
   * 创建或获取下划线装饰类型（待修改状态）
   */
  private createOrGetUnderlineDecorationAmber(): vscode.TextEditorDecorationType {
    if (!this.underlineDecorationAmber) {
      this.underlineDecorationAmber =
        vscode.window.createTextEditorDecorationType({
          textDecoration: 'underline; text-decoration-color: #ff9e35;',
          overviewRulerColor: '#ff9e35',
          overviewRulerLane: vscode.OverviewRulerLane.Right,
        });
    }
    return this.underlineDecorationAmber;
  }

  /**
   * 归一化装饰项路径
   */
  private normalizeDecorationItems(items: DecorationItem[]): DecorationItem[] {
    return items
      .filter(it => it.filePath && it.lineRange)
      .map(it => ({
        filePath: it.filePath.replace(/\\/g, '/'),
        lineRange: it.lineRange,
        hover: it.hover,
        status: it.status,
      }));
  }

  /**
   * 过滤与当前文档相关的装饰项
   */
  private filterRelatedDecorationItems(
    normalizedItems: DecorationItem[],
    docPath: string,
  ): DecorationItem[] {
    const normalizedDocPath = docPath.replace(/\\/g, '/');
    return normalizedItems.filter(it => {
      return (
        normalizedDocPath.endsWith(it.filePath) ||
        it.filePath.endsWith(normalizedDocPath) ||
        normalizedDocPath.includes(it.filePath)
      );
    });
  }

  /**
   * 构建装饰选项数组
   */
  private buildDecorationOptions(
    relatedItems: DecorationItem[],
    document: vscode.TextDocument,
  ): {
    unconfirmed: vscode.DecorationOptions[];
    toModify: vscode.DecorationOptions[];
  } {
    const optionsUnconfirmed: vscode.DecorationOptions[] = [];
    const optionsToModify: vscode.DecorationOptions[] = [];

    for (const it of relatedItems) {
      const ranges = this.parseRangesForDocument(document, it.lineRange);
      for (const r of ranges) {
        const md = new vscode.MarkdownString(it.hover ?? '');
        md.isTrusted = true;

        if (
          it.status === EnumConfirmResult.Modified ||
          it.status === EnumConfirmResult.Rejected
        ) {
          continue; // 不显示
        }

        if (it.status === EnumConfirmResult.ToModify) {
          optionsToModify.push({ range: r, hoverMessage: md });
        } else {
          optionsUnconfirmed.push({ range: r, hoverMessage: md });
        }
      }
    }

    return { unconfirmed: optionsUnconfirmed, toModify: optionsToModify };
  }

  /**
   * 为单个编辑器应用装饰
   */
  private applyDecorationsToEditor(
    editor: vscode.TextEditor,
    relatedItems: DecorationItem[],
  ): void {
    try {
      const { unconfirmed, toModify } = this.buildDecorationOptions(
        relatedItems,
        editor.document,
      );

      // 可能抛错：当编辑器在迭代过程中被释放或传入范围异常时
      editor.setDecorations(this.underlineDecoration!, unconfirmed);
      editor.setDecorations(this.underlineDecorationAmber!, toModify);
    } catch {
      // ignore per-editor failure
    }
  }

  /**
   * 更新所有可见编辑器上的下划线装饰
   */
  private updateUnderlineDecorations(items: DecorationItem[]): void {
    try {
      // 缓存最新的装饰项，便于文件切换时重放
      this.lastDecorationItems = items || [];

      // 创建装饰类型
      this.createOrGetUnderlineDecoration();
      this.createOrGetUnderlineDecorationAmber();

      // 归一化路径为 fsPath 末尾比较
      const normalizedItems = this.normalizeDecorationItems(items);

      // 对每个可见编辑器应用装饰（仅匹配到的文件）
      for (const editor of vscode.window.visibleTextEditors) {
        const docPath = editor.document.uri.fsPath;
        const related = this.filterRelatedDecorationItems(
          normalizedItems,
          docPath,
        );

        if (related.length === 0) {
          // 清空该编辑器的装饰
          editor.setDecorations(this.underlineDecoration!, []);
          editor.setDecorations(this.underlineDecorationAmber!, []);
          continue;
        }

        this.applyDecorationsToEditor(editor, related);
      }
    } catch {
      // ignore top-level failure in applying decorations
    }
  }
}
