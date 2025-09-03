/**
 * 跨端共享枚举定义
 *
 * 本文件包含扩展端与 Webview 之间通信所需的所有枚举类型，
 * 确保两端使用统一的标识符，避免魔法字符串和类型不一致问题。
 */

/**
 * 消息类型枚举
 *
 * 定义 Webview 与 Extension 之间的所有通信消息类型。
 * 每个消息类型都有明确的业务含义和触发时机。
 */
export enum EnumMessageType {
  // Webview → Extension 请求消息
  /** 获取当前鉴权状态，包括服务器地址、连接状态、登录状态等信息 */
  GetAuthState = 'get-auth-state',
  /** 测试与后端服务的网络连通性，成功后允许用户进行登录操作 */
  TestConnection = 'test-connection',
  /** 使用用户名和密码进行身份验证，扩展端验证后返回最新鉴权状态 */
  Login = 'login',
  /** 获取应用初始化所需的数据，包括列配置、项目列表、初始评论等 */
  GetInitialData = 'get-initial-data',
  /** Webview 组件挂载完成并建立消息通道，扩展端可以开始发送初始数据 */
  WebviewReady = 'webview-ready',
  /** 将用户编辑的数据发送到扩展端进行持久化存储 */
  UpdateEditData = 'update-edit-data',
  /** 提交评审数据到后端服务器进行保存 */
  SubmitData = 'submit-data',
  /** 同步当前查询条件，包括选中的项目和筛选状态 */
  UpdateQueryContext = 'update-query-context',
  /** 根据查询条件获取评论列表数据 */
  QueryComments = 'query-comments',
  /** 保存评审意见，包含选中的文本和行号信息 */
  SaveReviewComment = 'save-review-comment',
  /** 打开文件并跳转到指定行号 */
  OpenFile = 'open-file',
  /** Webview 向扩展端上报日志事件（级别、上下文、数据等） */
  WebviewLogReport = 'webview-log',

  // Extension → Webview 事件消息
  /** 鉴权状态发生变化时通知 Webview，包括登录、登出、连接状态变更 */
  AuthState = 'auth-state',
  /** 表格初始化数据加载完成，包含列配置、项目列表、评论数据等完整信息 */
  TableDataLoaded = 'table-data-loaded',
  /** 评论查询操作完成，返回最新的评论列表数据 */
  CommentsLoaded = 'comments-loaded',
  /** Editorial 页面初始化数据，包含所有必要的数据 */
  EditorialInit = 'editorial-init',
  /** 新增评审意见已保存，通知侧边栏刷新数据 */
  NewReviewCommentAdded = 'new-review-comment-added',
}

/**
 * VS Code 命令标识枚举
 *
 * 定义扩展中注册的所有命令标识符，用于命令面板、快捷键、菜单等场景。
 * 所有命令都以 "coreview." 为前缀，便于识别和管理。
 */
export enum EnumCommands {
  /** 刷新审查列表数据，触发视图重新渲染或请求最新的服务器数据 */
  REFRESH_REVIEWS = 'coreview.refreshReviews',

  /** 退出当前登录状态，清理所有鉴权信息并返回到登录页面 */
  LOGOUT = 'coreview.logout',

  /** 在默认浏览器中打开服务器的 Web 管理页面 */
  OPEN_WEB_PAGE = 'coreview.openWebPage',

  /** 打开添加评审意见面板，用于快速添加代码评审意见 */
  ADD_REVIEW_COMMENT = 'coreview.addReviewComment',

  /** 查看日志文件，打开最近的日志以便排查问题 */
  VIEW_LOGS = 'coreview.viewLogs',
}

/**
 * 视图标识枚举
 *
 * 定义扩展中创建的所有 Webview 视图的标识符。
 * 用于视图的创建、查找和管理。
 */
export enum EnumViews {
  /** 主视图标识，对应活动栏中显示的 CoReview 主界面 */
  MAIN_VIEW = 'coreview.mainView',

  /** 编辑视图标识，对应添加评审意见的独立面板 */
  EDITORIAL_VIEW = 'coreview.editorialView',
}

/**
 * Webview 路由路径枚举
 *
 * 定义前端应用中的路由路径常量，确保路由跳转的一致性和可维护性。
 */
export enum EnumWebviewPath {
  /** 应用根路径，登录成功后进入的主页面 */
  Root = '/',

  /** 登录页面路径，未登录状态下自动跳转的目标页面 */
  Login = '/login',
}

/**
 * HTTP 请求方法枚举
 *
 * 定义与后端 API 通信时使用的 HTTP 方法类型。
 */
export enum EnumHttpMethod {
  /** GET 请求方法 */
  Get = 'GET',

  /** POST 请求方法 */
  Post = 'POST',
}

/**
 * 评审列表筛选条件枚举
 *
 * 定义评审列表页面中可用的筛选选项，用于过滤不同状态的评审记录。
 */
export enum EnumReviewListFilter {
  /** 仅显示当前用户提交的评审记录 */
  Mine = '我提交的',

  /** 仅显示需要当前用户确认的评审记录 */
  ToConfirm = '待我确认',
}

/**
 * 表单输入控件类型枚举
 *
 * 定义表单中各种输入控件的类型，用于动态渲染不同类型的表单字段。
 */
export enum EnumInputType {
  /** 单行文本输入框，适用于短文本输入 */
  TEXT = 'TEXT',

  /** 下拉选择框，适用于从预定义选项中选择 */
  COMBO_BOX = 'COMBO_BOX',

  /** 多行文本输入框，适用于长文本内容输入 */
  TEXTAREA = 'TEXTAREA',

  /** 日期选择器，适用于日期类型的数据输入 */
  DATE = 'DATE',
}

/**
 * 评审操作类型枚举
 *
 * 定义对评审记录可以执行的各种操作类型，用于记录操作历史和权限控制。
 */
export enum EnumCommentOperateType {
  /** 提交操作，创建新的评审记录 */
  Submit = 0,

  /** 修改操作，更新已存在的评审记录 */
  Modify = 1,

  /** 确认操作，确认评审结果并标记为已处理 */
  Confirm = 2,

  /** 删除操作，删除评审记录 */
  Delete = 3,
}

/**
 * 确认结果枚举
 *
 * 定义评审记录的确认状态，用于后续处理与统计。
 */
export enum EnumConfirmResult {
  /** 未确认 */
  Unconfirmed = 'unconfirmed',
  /** 已修改 */
  Modified = '2',
  /** 待修改 */
  ToModify = '3',
  /** 拒绝 */
  Rejected = '4',
}

/**
 * 日志级别枚举
 *
 * 定义 Webview 上报扩展端的日志级别。
 */
export enum EnumLogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}
