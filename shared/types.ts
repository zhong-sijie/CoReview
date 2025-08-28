import {
  type EnumInputType,
  type EnumReviewListFilter,
  type EnumRoleCode,
  type EnumUserType,
} from "./enums";

/**
 * VSCode API 全局类型声明
 *
 * 为 Webview 环境中的 VSCode API 提供类型支持，
 * 确保在 Webview 中可以安全地调用 VSCode 扩展的 API。
 */
declare global {
  interface Window {
    acquireVsCodeApi: () => {
      /** 向扩展发送消息，使用严格的消息负载类型 */
      postMessage: (message: {
        type: string;
        payload: AllMessagePayloads;
      }) => void;
    };
  }
}

/**
 * 跨端共享类型定义
 *
 * 本文件包含扩展端与 Webview 之间通信所需的所有类型定义，
 * 确保两端使用统一的数据结构，避免类型不一致问题。
 */

/**
 * 枚举选项接口
 *
 * 用于下拉框、选择器等 UI 组件的基础选项结构，
 * 包含选项值和显示名称两个基本属性。
 */
export interface EnumOption {
  /** 选项的实际值，用于提交到后端或进行业务逻辑处理 */
  value: string;
  /** 选项在 UI 中的显示名称，用于用户界面展示 */
  showName: string;
}

/**
 * 列配置接口
 *
 * 定义表格列的各种配置属性，包括显示控制、编辑权限、导出设置等。
 * 用于动态生成表格和表单，支持灵活的列配置管理。
 */
export interface ColumnConfig {
  /** 列配置的唯一标识符，由后端分配 */
  id: number;
  /** 列的业务编码，用作字段标识、表单字段名、数据键等 */
  columnCode: string;
  /** 列在用户界面中的显示名称 */
  showName: string;
  /** 列在页面和导出文件中的排序序号，数值越小排序越靠前 */
  sortIndex: number;
  /** 是否支持导出到 Excel 文件 */
  supportInExcel: boolean;
  /** 导出到 Excel 时的列宽设置，单位为字符宽度 */
  excelColumnWidth: number;
  /** 是否为系统初始化字段，通常不可删除或修改 */
  systemInitialization: boolean;
  /** 是否在 IDE 插件端的表格中显示 */
  showInIdeaTable: boolean;
  /** Web 端表格中的列宽设置，单位为像素 */
  webTableColumnWidth: number;
  /** 是否在 Web 端表格中显示 */
  showInWebTable: boolean;
  /** 是否在新增页面的表单中显示 */
  showInAddPage: boolean;
  /** 是否在编辑页面的表单中显示 */
  showInEditPage: boolean;
  /** 是否在确认页面中显示（用于显示确认结果或说明） */
  showInConfirmPage: boolean;
  /** 在新增页面中是否允许编辑 */
  editableInAddPage: boolean;
  /** 在编辑页面中是否允许编辑 */
  editableInEditPage: boolean;
  /** 在确认页面中是否允许编辑 */
  editableInConfirmPage: boolean;
  /** 输入控件的类型，决定表单字段的渲染方式 */
  inputType: EnumInputType;
  /** 选项字典的编码，当 inputType 为 COMBO_BOX 时指向后端字典集合 */
  dictCollectionCode?: string;
  /** 可选项列表，通常与字典编码配套使用，也可为后端回填的静态选项 */
  enumValues?: EnumOption[];
  /** 是否为必填字段，用于表单验证 */
  required: boolean;
}

/**
 * 部门信息接口
 *
 * 描述组织架构中的部门信息，包含部门的基本标识和名称。
 */
export interface Department {
  /** 部门的唯一标识符 */
  id: number;
  /** 部门的名称 */
  name: string;
}

/**
 * 角色信息接口
 *
 * 描述用户的角色权限信息，包含角色标识和名称。
 */
export interface Role {
  /** 角色的唯一标识符 */
  id: number;
  /** 角色的编码，对应后端定义的角色代码 */
  roleCode: EnumRoleCode;
  /** 角色的显示名称，用于用户界面展示 */
  roleName: string;
}

/**
 * 用户详情信息接口
 *
 * 描述用户的完整信息，包括基本信息、部门、角色等。
 */
export interface UserDetail {
  /** 用户的登录账号 */
  account: string;
  /** 用户的真实姓名 */
  name: string;
  /** 用户的手机号码，可选字段 */
  phoneNumber?: string;
  /** 用户所属的部门信息 */
  department?: Department;
  /** 用户拥有的角色列表 */
  roles?: Role[];
  /** 用户账号是否启用 */
  enabled?: boolean;
  /** 用户的类型分类 */
  userType?: EnumUserType;
}

/**
 * 登录请求接口
 *
 * 定义用户登录时提交的认证信息结构。
 */
export interface LoginRequest {
  /** 用户的登录账号 */
  account: string;
  /** 用户的密码，通常为 MD5 加密后的字符串 */
  password: string;
}

/**
 * 鉴权检查响应接口
 *
 * 定义后端鉴权检查的响应结果结构。
 */
export interface CheckAuthResponse {
  /** 是否通过鉴权检查 */
  pass: boolean;
  /** 鉴权失败时的错误信息 */
  message?: string;
}

/**
 * 项目选项响应接口
 *
 * 定义从后端获取的项目下拉选项数据结构。
 */
export interface ProjectOptionResponse {
  /** 项目的唯一标识符 */
  projectId: number;
  /** 项目的名称 */
  projectName: string;
}

/**
 * 通用下拉选项类型
 *
 * 泛型类型，用于定义各种下拉选择器的选项结构。
 * 支持字符串和数字类型的选项值。
 */
export type SelectOption<T extends string | number> = {
  /** 选项的实际值 */
  value: T;
  /** 选项的显示标签 */
  label: string;
};

/** 项目下拉选项类型，选项值为数字类型 */
export type ProjectSelectOption = SelectOption<number>;

/** 评审列表筛选选项类型，选项值为筛选条件枚举 */
export type ReviewListFilterOption = SelectOption<EnumReviewListFilter>;

/**
 * 通用消息接口
 *
 * 泛型接口，定义扩展端与 Webview 之间通信的消息结构。
 * 包含消息类型和业务负载两个基本属性。
 */
export interface Message<TPayload = unknown> {
  /** 消息的类型标识，对应 EnumMessageType 中定义的枚举值 */
  type: string;
  /** 消息的业务数据负载 */
  payload: TPayload;
}

/**
 * Webview 发送到扩展的消息类型
 *
 * 定义从 Webview 发送到扩展端的消息结构。
 */
export type WebViewMessage<TPayload = unknown> = Message<TPayload>;

/**
 * 扩展发送到 Webview 的消息类型
 *
 * 定义从扩展端发送到 Webview 的消息结构。
 */
export type ExtensionMessage<TPayload = unknown> = Message<TPayload>;

/**
 * 异步操作结果接口
 *
 * 定义异步操作的统一返回结果结构，
 * 用于跨端通信中的操作结果反馈。
 */
export interface AsyncResult {
  /** 操作是否成功完成 */
  success: boolean;
  /** 操作失败时的错误信息 */
  error?: string;
}

/**
 * 列配置响应接口
 *
 * 定义从后端获取列配置数据的响应结构。
 */
export interface ColumnConfigResponse {
  /** 列配置数组 */
  columns: ColumnConfig[];
}

/**
 * 查询上下文接口
 *
 * 定义查询时使用的项目ID和筛选类型。
 */
export interface QueryContext {
  /** 项目ID */
  projectId?: number;
  /** 筛选类型 */
  filterType?: EnumReviewListFilter;
}

/**
 * 初始表格数据结构接口
 *
 * 定义表格初始化时需要的完整数据结构。
 */
export interface InitialTableData {
  /** 表格的列配置信息 */
  columns?: ColumnConfig[];
  /** 可选的项目列表 */
  projects?: ProjectOptionResponse[];
  /** 初始的评论数据列表 */
  comments?: ReviewCommentItem[];
  /** 查询上下文 */
  queryContext?: QueryContext | null;
}

/**
 * 评审字段值接口
 *
 * 泛型接口，定义评审记录中每个字段的值结构。
 * 包含原始值和可展示名称，支持多种数据类型。
 */
export interface ReviewFieldValue<T = string | number | boolean | null> {
  /** 字段的原始值，用于业务计算和数据提交 */
  value: T;
  /** 字段的展示名称，用于用户界面友好显示，如字典值、人员姓名等 */
  showName: string | null;
}

/**
 * 评审评论值集合接口
 *
 * 定义评审记录中所有业务字段的集合结构。
 * 每个字段都使用 ReviewFieldValue 包装，支持原始值和展示名称。
 */
export interface ReviewCommentValues {
  /** 评审记录的唯一标识符，与后端记录 ID 对齐 */
  identifier: ReviewFieldValue<string>;
  /** 文件快照内容，包含代码片段或文本内容 */
  fileSnapshot?: ReviewFieldValue<string>;
  /** 所属的模块或子系统名称 */
  module?: ReviewFieldValue<string>;
  /** 文件的相对路径，在代码仓库中的位置 */
  filePath?: ReviewFieldValue<string>;
  /** 指定的确认人账号，showName 为中文姓名 */
  assignConfirmer?: ReviewFieldValue<string>;
  /** 评审人账号，showName 为中文姓名 */
  reviewer?: ReviewFieldValue<string>;
  /** 评审来源，如人工、自动扫描、TL 识别等 */
  source?: ReviewFieldValue<string>;
  /** 优先级等级，如 P0-P4 */
  priority?: ReviewFieldValue<string>;
  /** 评审类型，如缺陷、建议、优化等 */
  type?: ReviewFieldValue<string>;
  /** 评审点的具体内容描述 */
  content?: ReviewFieldValue<string>;
  /** 确认时间，格式为 yyyy-MM-dd HH:mm:ss，未确认为 null */
  confirmDate?: ReviewFieldValue<string | null>;
  /** 确认备注，确认人填写的说明信息 */
  confirmNotes?: ReviewFieldValue<string | null>;
  /** Git 分支名称，如 origin/feature-x */
  gitBranchName?: ReviewFieldValue<string>;
  /** 评审时间，记录创建或最新评审的时间 */
  reviewDate?: ReviewFieldValue<string>;
  /** 确认结果，如 unconfirmed、accepted、rejected 等 */
  confirmResult?: ReviewFieldValue<string>;
  /** 实际确认人账号，showName 为中文姓名，未确认为 null */
  realConfirmer?: ReviewFieldValue<string | null>;
  /** 评审补充说明或评论内容，支持富文本或纯文本 */
  comment?: ReviewFieldValue<string>;
  /** 涉及的代码行范围，如 "4 ~ 8" */
  lineRange?: ReviewFieldValue<string>;
  /** 项目 ID，支持数值或字符串类型，showName 为项目名称 */
  projectId?: ReviewFieldValue<string | number>;
  /** Git 仓库名称，包含地址和命名空间信息 */
  gitRepositoryName?: ReviewFieldValue<string>;
}

/**
 * 评审评论项接口
 *
 * 定义单条评审记录的完整结构，包含元数据和业务字段。
 */
export interface ReviewCommentItem {
  /** 记录的主键 ID */
  id: string;
  /** 数据版本号，用于服务端并发控制和数据演进 */
  dataVersion: number;
  /** 业务字段的集合，包含所有评审相关的数据 */
  values: ReviewCommentValues;
  /** 记录状态，0 表示正常，其他值由后端定义 */
  status: number;
  /** 最近一次操作的类型，对应 EnumCommentOperateType 枚举 */
  latestOperateType: number;
}

/**
 * 查询评论响应类型
 *
 * 定义查询评审评论列表的响应数据结构。
 */
export type QueryCommentsResponse = { comments: ReviewCommentItem[] };

/**
 * 提交评论响应接口
 *
 * 定义提交评审评论到后端的响应结果结构。
 */
export interface CommitCommentsResponse {
  /** 整体操作是否成功 */
  success: boolean;
  /** 错误描述信息，成功时为 null */
  errDesc: string | null;
  /** 成功提交的记录 ID 到新版本号的映射 */
  versionMap: Record<string, number>;
  /** 提交失败的记录 ID 列表 */
  failedIds: string[];
}

/**
 * 消息负载类型定义
 *
 * 定义各种消息类型的具体负载结构，确保类型安全的消息传递。
 */

/**
 * 基础消息负载接口
 *
 * 所有消息负载的基础接口，包含可选的回调 ID。
 * 内部使用，不对外暴露。
 */
interface BaseMessagePayload {
  /** 可选的回调标识符，用于异步操作的结果回调 */
  callbackId?: string;
}

/**
 * 连接测试消息负载接口
 *
 * 定义测试与后端服务连通性时发送的消息负载。
 */
export interface TestConnectionPayload extends BaseMessagePayload {
  /** 要测试连接的服务器地址 */
  serverUrl: string;
}

/**
 * 登录消息负载接口
 *
 * 定义用户登录时发送的消息负载。
 */
export interface LoginPayload extends BaseMessagePayload {
  /** 用户的登录账号 */
  username: string;
  /** 用户的登录密码 */
  password: string;
}

/**
 * 更新编辑数据消息负载接口
 *
 * 定义更新用户编辑数据时发送的消息负载。
 */
export interface UpdateEditDataPayload extends BaseMessagePayload {
  /** 编辑数据的键值对数组，键为记录 ID，值为编辑后的评论项 */
  editData: [string, ReviewCommentItem][];
}

/**
 * 提交编辑数据消息负载接口
 *
 * 定义提交编辑完成的评审数据时发送的消息负载。
 */
export interface SubmitEditDataPayload extends BaseMessagePayload {
  /** 要提交的评审评论项数组 */
  submitData: ReviewCommentItem[];
}

/**
 * 更新查询上下文消息负载接口
 *
 * 定义更新查询条件时发送的消息负载。
 */
export interface UpdateQueryContextPayload extends BaseMessagePayload {
  /** 查询的项目 ID，支持字符串或数字类型，可为 undefined */
  projectId: string | number | undefined;
  /** 查询的筛选类型 */
  type: EnumReviewListFilter;
}

/**
 * 查询评论消息负载接口
 *
 * 定义查询评论列表时发送的消息负载。
 */
export interface QueryCommentsPayload extends BaseMessagePayload {
  /** 查询的项目 ID，支持字符串或数字类型，可为 undefined */
  projectId: string | number | undefined;
  /** 查询的筛选类型 */
  type: EnumReviewListFilter;
}

/**
 * 获取鉴权状态消息负载接口
 *
 * 定义获取当前鉴权状态时发送的消息负载。
 */
export interface GetAuthStatePayload extends BaseMessagePayload {
  // 空负载，仅用于触发获取状态
}

/**
 * 获取初始数据消息负载接口
 *
 * 定义获取应用初始化数据时发送的消息负载。
 */
export interface GetInitialDataPayload extends BaseMessagePayload {
  // 空负载，仅用于触发获取数据
}

/**
 * 退出登录消息负载接口
 *
 * 定义退出登录时发送的消息负载。
 */
export interface LogoutPayload extends BaseMessagePayload {
  // 空负载，仅用于触发退出登录
}

/**
 * Webview 就绪消息负载接口
 *
 * 定义 Webview 组件挂载完成时发送的消息负载。
 */
export interface WebviewReadyPayload extends BaseMessagePayload {
  // 空负载，仅用于通知 Webview 已就绪
}

/**
 * 鉴权状态事件负载接口
 *
 * 定义扩展端发送鉴权状态变更事件的负载。
 */
export interface AuthStatePayload {
  /** 服务器地址 */
  serverUrl: string | null;
  /** 连接状态 */
  connectionOk: boolean;
  /** 登录状态 */
  loggedIn: boolean;
  /** 用户详情 */
  userDetail?: unknown | null;
}

/**
 * 表格数据加载事件负载接口
 *
 * 定义扩展端发送表格初始化数据事件的负载。
 */
export interface TableDataLoadedPayload extends InitialTableData {
  /** 持久化存储的编辑数据，用于恢复用户的编辑状态 */
  editData?: Record<string, ReviewCommentItem> | null;
}

/**
 * 评论加载完成事件负载接口
 *
 * 定义扩展端发送评论查询完成事件的负载。
 */
export interface CommentsLoadedPayload {
  /** 评论列表数据 */
  comments: ReviewCommentItem[];
}

/**
 * 所有消息负载的联合类型
 *
 * 包含所有可能的消息负载类型，用于严格的类型检查。
 */
export type AllMessagePayloads =
  | TestConnectionPayload
  | LoginPayload
  | UpdateEditDataPayload
  | SubmitEditDataPayload
  | UpdateQueryContextPayload
  | QueryCommentsPayload
  | GetAuthStatePayload
  | GetInitialDataPayload
  | LogoutPayload
  | WebviewReadyPayload
  | AuthStatePayload
  | TableDataLoadedPayload
  | CommentsLoadedPayload;
