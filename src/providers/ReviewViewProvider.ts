import * as vscode from "vscode";
import { EnumMessageType, EnumViews } from "../../shared/enums";
import {
  ProjectOptionResponse,
  ReviewCommentItem,
  ColumnConfig,
  TestConnectionPayload,
  LoginPayload,
  UpdateEditDataPayload,
  SubmitEditDataPayload,
  UpdateQueryContextPayload,
  QueryCommentsPayload,
  WebViewMessage,
  QueryContext,
} from "../../shared/types";
import { AuthService } from "../services/AuthService";
import { StateService } from "../services/StateService";
import { TableService } from "../services/TableService";
import { WebViewService } from "../services/WebViewService";
import { showError, showInfo } from "../utils";

/**
 * ReviewViewProvider 负责桥接 VS Code 扩展主机与 Webview 界面
 *
 * 主要功能：
 * - 创建并初始化 Webview（注入 HTML、注册消息处理器、发送初始数据）
 * - 作为控制器与服务层交互，并将结果回传给 Webview
 *
 * 关键对象说明：
 * - webViewService: 封装了 Webview 的 HTML 注入与消息总线注册/分发能力
 * - authService: 鉴权服务（负责接口调用和业务逻辑）
 * - stateService: 状态管理服务（负责状态持久化和变更通知）
 *
 * 消息通信约定：
 * - Webview → Extension: GetAuthState / TestConnection / Login / GetInitialData
 * - Extension → Webview: AuthState / TableDataLoaded，以及异步操作的回调（以 callbackId 作为消息 type 回传 { success, error }）
 */
export class ReviewViewProvider implements vscode.WebviewViewProvider {
  /** 视图类型标识符 */
  public static readonly viewType = EnumViews.MAIN_VIEW;

  /** Webview 视图实例 */
  private _view?: vscode.WebviewView;

  /** Webview 服务实例，负责 HTML 注入和消息处理 */
  private webViewService: WebViewService;

  /** 认证服务实例，负责鉴权相关操作 */
  private authService: AuthService;

  /** 状态服务实例，负责状态管理和持久化 */
  private stateService: StateService;

  /** 表格服务实例，负责表格数据操作 */
  private tableService: TableService;

  /**
   * 通用的异步消息处理器，自动处理 try-catch 和回调
   *
   * 入参：
   * - message: 来自 Webview 的原始消息，其中 payload.callbackId 为一次性回调标识（可选）
   * - asyncHandler: 实际业务处理函数（返回 Promise）
   *
   * 行为：
   * - 成功: 向 Webview 回发 { type: callbackId, payload: { success: true } }
   * - 失败: 展示错误提示，并回发 { success: false, error }
   */
  private async handleAsyncMessage(
    message: any,
    asyncHandler: () => Promise<void>
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
   * 初始化内容：
   * - webViewService: Webview 容器服务（提供 HTML 注入与消息注册/分发）
   * - authService: 鉴权服务（负责接口调用和业务逻辑）
   * - stateService: 状态管理服务（负责状态持久化和变更通知）
   * - setupMessageHandlers: 注册所有来自 Webview 的消息处理器（如鉴权/审查相关消息）
   */
  constructor(private readonly _extensionUri: vscode.Uri) {
    this.webViewService = WebViewService.getInstance();
    this.authService = AuthService.getInstance();
    this.stateService = StateService.getInstance();
    this.tableService = TableService.getInstance();
    this.setupMessageHandlers();
  }

  /**
   * 解析并初始化 Webview 视图
   *
   * 执行流程：
   * 1. 配置 webview 选项（启用脚本、限制资源访问）
   * 2. 注入前端页面 HTML
   * 3. 设置消息监听器
   * 4. 等待 WebviewReady 后发送初始数据
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
      (message) => {
        this.handleWebViewMessage(message);
      },
      undefined,
      []
    );

    // 4) 初始数据将在收到 WebviewReady 后发送
  }

  /**
   * 重新加载整个 Webview（HTML 与初始数据）
   *
   * 供命令调用，用于刷新界面内容
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
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    return this.webViewService.getWebViewContent(webview, this._extensionUri);
  }

  /**
   * 注册来自 Webview 的消息处理器
   *
   * 为每种消息类型注册对应的处理函数，实现双向通信
   */
  private setupMessageHandlers(): void {
    // Webview 挂载完成后再发送初始数据
    this.webViewService.registerMessageHandler(
      EnumMessageType.WebviewReady,
      () => {
        this.sendInitialData();
      }
    );

    // 获取鉴权状态
    // 输入: 无（仅触发）
    // 行为: 读取 authService.getState() 并通过 AuthState 事件回发至 Webview
    this.webViewService.registerMessageHandler(
      EnumMessageType.GetAuthState,
      () => {
        this.sendAuthState();
      }
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
          showInfo("连接测试成功");
        });
      }
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
          this.sendColumnConfig(columns, projects, comments, queryContext);

          showInfo("登录成功");
        });
      }
    );

    // 获取初始数据
    this.webViewService.registerMessageHandler(
      EnumMessageType.GetInitialData,
      async (message) => {
        await this.handleAsyncMessage(message, async () => {
          // 1) 调用表格服务并行获取列配置与项目
          const { columns, projects, comments, queryContext } =
            await this.tableService.loadGetInitialTable();
          // 2) 将初始化数据发送给 Webview
          this.sendColumnConfig(columns, projects, comments, queryContext);
        });
      }
    );

    // 更新编辑数据
    this.webViewService.registerMessageHandler(
      EnumMessageType.UpdateEditData,
      async (message: WebViewMessage<UpdateEditDataPayload>) => {
        const { editData } = message.payload ?? {}; // Webview 传入的完整编辑数据

        await this.handleAsyncMessage(message, async () => {
          // 1) 调用表格服务保存编辑数据
          await this.tableService.saveEditData(editData);
        });
      }
    );

    // 提交编辑数据（可根据后端接口进一步实现）
    this.webViewService.registerMessageHandler(
      EnumMessageType.SubmitEditData,
      async (message: WebViewMessage<SubmitEditDataPayload>) => {
        const { submitData } = message.payload ?? {};
        await this.handleAsyncMessage(message, async () => {
          // 1) 调用提交接口
          const result = await this.tableService.loadCommitComments({
            comments: submitData || [],
          });
          if (result.success) {
            showInfo("提交完成");
          } else {
            showError(`提交失败：${result.errDesc ?? "未知错误"}`);
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
        });
      }
    );

    // 同步查询上下文（项目与状态）
    this.webViewService.registerMessageHandler(
      EnumMessageType.UpdateQueryContext,
      async (message: WebViewMessage<UpdateQueryContextPayload>) => {
        await this.handleAsyncMessage(message, async () => {
          const { projectId, type } = message.payload ?? {};
          this.stateService.setQueryContext({
            projectId: typeof projectId === "number" ? projectId : undefined,
            filterType: type,
          });
        });
      }
    );

    // 按条件查询评论
    this.webViewService.registerMessageHandler(
      EnumMessageType.QueryComments,
      async (message: WebViewMessage<QueryCommentsPayload>) => {
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
      }
    );
  }

  /**
   * 将 Webview 消息分发给已注册的处理器
   */
  private handleWebViewMessage(message: any): void {
    const handler = this.webViewService.messageHandlers.get(message.type);
    if (handler) {
      handler(message);
    }
  }

  /**
   * 发送当前鉴权状态给 Webview
   *
   * 同时更新 VS Code 上下文键，用于控制命令的可用性
   */
  private sendAuthState(): void {
    if (this._view) {
      const state = this.stateService.getState();

      // 更新 VS Code 上下文键
      vscode.commands.executeCommand(
        "setContext",
        "coreview.loggedIn",
        state.loggedIn
      );

      // Extension → Webview: 通过 AuthState 事件携带最新鉴权状态
      this._view.webview.postMessage({
        type: EnumMessageType.AuthState,
        payload: state,
      });
    }
  }

  /**
   * 发送表格初始化数据给 Webview（包含列配置、项目列表与初始评论）
   */
  private sendColumnConfig(
    columns?: ColumnConfig[],
    projects?: ProjectOptionResponse[],
    comments?: ReviewCommentItem[],
    queryContext?: QueryContext | null
  ): void {
    if (this._view) {
      // 获取持久化的编辑数据
      const persistedEditData = this.tableService.getPersistedEditData();

      // Extension → Webview: 通过 TableDataLoaded 事件携带初始化数据
      this._view.webview.postMessage({
        type: EnumMessageType.TableDataLoaded,
        payload: {
          columns,
          projects,
          comments,
          editData: persistedEditData,
          queryContext,
        },
      });
    }
  }

  /**
   * 对外公开：广播当前鉴权状态
   *
   * 供外部调用，用于主动推送鉴权状态变更
   */
  public broadcastAuthState(): void {
    this.sendAuthState();
  }

  /**
   * 首次渲染时发送初始数据
   *
   * 仅下发鉴权状态；列配置在登录成功后再拉取
   */
  private sendInitialData(): void {
    // 仅下发鉴权状态；列配置在登录成功后再拉取
    this.sendAuthState();
    const authState = this.stateService.getState();
    if (authState.loggedIn) {
      this.tableService
        .loadGetInitialTable()
        .then(({ columns, projects, comments, queryContext }) =>
          this.sendColumnConfig(columns, projects, comments, queryContext)
        );
    }
  }
}
