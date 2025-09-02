import * as vscode from 'vscode';
import { EnumReviewListFilter } from '../../shared/enums';
import {
  ColumnConfig,
  QueryContext,
  ReviewCommentItem,
  UserDetail,
} from '../../shared/types';

/**
 * 应用状态接口
 *
 * 定义应用运行时的完整状态结构，包含所有需要持久化和管理的状态信息。
 */
export interface AppState {
  /** 已保存的服务端地址（示例: https://your-company-coreview.example.com） */
  serverUrl: string | null;
  /** 最近一次连接测试是否成功（true 代表允许输入账号/密码并尝试登录） */
  connectionOk: boolean;
  /** 登录态（基于服务器地址、账号、密码是否同时存在得出） */
  loggedIn: boolean;
  /** 登录后服务端返回的用户详情（用于页面展示，不包含敏感 token） */
  userDetail: UserDetail | null;
  /** 编辑数据存储（保存用户编辑过的表格数据） */
  editData: Record<string, ReviewCommentItem> | null;
  /** 查询上下文（项目ID和筛选类型） */
  queryContext: QueryContext | null;
  /** 列配置数据 */
  columnConfig: ColumnConfig[] | null;
  /** 新增的评审意见临时存储 */
  addData: Record<string, ReviewCommentItem> | null;
}

/**
 * 全局状态管理服务
 *
 * 负责管理与持久化所有应用状态，提供状态变更通知机制。
 * 采用单例模式确保全局只有一个状态管理实例。
 *
 * 关键设计：
 * - 全局存储键（globalState）
 *   - coreview.baseUrl: 服务端基础地址
 *   - coreview.account: 登录账号
 *   - coreview.password: 登录密码（MD5加密后的）
 *   - coreview.userDetail: 用户详情
 * - 状态变更通知: 通过事件机制通知状态变更
 * - 状态持久化: 自动保存到 VS Code 的 globalState 中
 */
export class StateService {
  /** 单例实例，确保全局只有一个状态管理服务 */
  private static instance: StateService;

  /** VS Code 全局状态存储对象，用于持久化数据 */
  private memento: vscode.Memento | null = null;

  /**
   * 全局存储键名
   *
   * 用于在 VS Code globalState 中持久化数据
   */
  private static readonly STORAGE_KEYS = {
    /** 服务端基础地址（字符串） */
    BASE_URL: 'coreview.baseUrl',
    /** 登录账号（字符串） */
    ACCOUNT: 'coreview.account',
    /** 登录密码（MD5加密后的字符串） */
    PASSWORD: 'coreview.password',
    /** 用户详情（任意可序列化结构） */
    USER_DETAIL: 'coreview.userDetail',
    /** 编辑数据（用户编辑过的表格数据） */
    EDIT_DATA: 'coreview.editData',
    /** 查询上下文（项目ID和筛选类型） */
    QUERY_CONTEXT: 'coreview.queryContext',
    /** 列配置数据 */
    COLUMN_CONFIG: 'coreview.columnConfig',
    /** 新增的评审意见临时存储 */
    ADD_DATA: 'coreview.addData',
  } as const;

  /** 当前应用状态，包含所有运行时状态信息 */
  private state: AppState = {
    /** 初始没有服务端地址，待初始化或连接测试时写入 */
    serverUrl: null,
    /** 初始连接状态为未通过 */
    connectionOk: false,
    /** 初始未登录（若初始化成功恢复到服务器地址、账号、密码，则会更新为 true） */
    loggedIn: false,
    /** 初始无用户详情（登录成功后写入） */
    userDetail: null,
    /** 初始无编辑数据 */
    editData: null,
    /** 初始无查询上下文 */
    queryContext: null,
    /** 初始无列配置数据 */
    columnConfig: null,
    /** 初始无新增评审意见 */
    addData: null,
  };

  /** 状态变更事件监听器列表，用于通知状态变化 */
  private stateChangeListeners: Array<(state: AppState) => void> = [];

  /**
   * 私有构造函数
   *
   * 防止外部直接实例化，强制使用单例模式。
   * 通过 getInstance() 方法获取实例。
   */
  private constructor() {}

  /**
   * 获取StateService的单例实例
   *
   * 如果实例不存在则创建新实例，如果已存在则返回现有实例。
   * 确保整个应用中只有一个状态管理服务实例。
   */
  public static getInstance(): StateService {
    if (!StateService.instance) {
      StateService.instance = new StateService();
    }
    return StateService.instance;
  }

  /**
   * 初始化状态管理服务
   *
   * 设置VS Code扩展上下文，并从持久化存储中恢复状态。
   * 在扩展激活时调用，用于恢复之前保存的状态数据。
   *
   * @param context VS Code 扩展上下文，提供 globalState 访问能力
   */
  public initialize(context: vscode.ExtensionContext): void {
    this.memento = context.globalState;
    this.loadStateFromStorage();
  }

  /**
   * 从持久化存储加载状态
   *
   * 从VS Code的globalState中恢复之前保存的状态数据。
   * 包括服务器地址、登录凭据、用户信息、编辑数据等。
   *
   * 执行流程：
   * 1. 检查 memento 是否可用
   * 2. 加载服务器地址
   * 3. 加载账号、密码与用户信息
   * 4. 根据凭据完整性判断登录状态
   * 5. 加载查询上下文、列配置、新增数据等
   */
  private loadStateFromStorage(): void {
    if (!this.memento) {
      return;
    }

    // 加载服务器地址
    const savedServerUrl = this.memento.get<string>(
      StateService.STORAGE_KEYS.BASE_URL,
    );

    if (savedServerUrl && typeof savedServerUrl === 'string') {
      this.state.serverUrl = savedServerUrl;
    }

    // 加载账号、密码与用户信息
    const savedAccount = this.memento.get<string>(
      StateService.STORAGE_KEYS.ACCOUNT,
    );

    const savedPassword = this.memento.get<string>(
      StateService.STORAGE_KEYS.PASSWORD,
    );

    // 如果服务器地址、账号、密码同时存在，则认为用户还处于登录状态
    if (this.state.serverUrl && savedAccount && savedPassword) {
      this.state.loggedIn = true;
    }

    const savedUser = this.memento.get<any>(
      StateService.STORAGE_KEYS.USER_DETAIL,
    );

    if (savedUser) {
      this.state.userDetail = savedUser;
    }

    // 加载查询上下文
    const savedQueryContext = this.memento.get<QueryContext>(
      StateService.STORAGE_KEYS.QUERY_CONTEXT,
    );
    if (savedQueryContext) {
      this.state.queryContext = savedQueryContext;
    }

    // 加载列配置数据
    const savedColumnConfig = this.memento.get<ColumnConfig[]>(
      StateService.STORAGE_KEYS.COLUMN_CONFIG,
    );
    if (savedColumnConfig) {
      this.state.columnConfig = savedColumnConfig;
    }

    // 加载新增的评审意见
    const savedAddData = this.memento.get<Record<string, ReviewCommentItem>>(
      StateService.STORAGE_KEYS.ADD_DATA,
    );
    if (savedAddData) {
      this.state.addData = savedAddData;
    }
  }

  /**
   * 获取当前应用状态
   *
   * 返回应用状态的副本，避免外部直接修改内部状态。
   * 使用对象展开运算符创建浅拷贝。
   *
   * @returns 当前应用状态的副本
   */
  public getState(): AppState {
    return { ...this.state };
  }

  /**
   * 设置服务器地址
   *
   * 更新服务器地址并持久化到存储中。
   * 同时触发状态变更通知。
   *
   * @param url 服务器地址，null 表示清除地址
   */
  public setServerUrl(url: string | null): void {
    this.state.serverUrl = url;
    if (url && this.memento) {
      this.memento.update(StateService.STORAGE_KEYS.BASE_URL, url);
    }
    this.notifyStateChange();
  }

  /**
   * 设置连接状态
   *
   * 更新连接状态并通知监听器。
   * 用于表示与服务器的网络连通性状态。
   *
   * @param ok 连接是否成功
   */
  public setConnectionOk(ok: boolean): void {
    this.state.connectionOk = ok;
    this.notifyStateChange();
  }

  /**
   * 设置登录状态
   *
   * 更新登录状态并通知监听器。
   * 用于表示用户是否已通过身份验证。
   *
   * @param loggedIn 是否已登录
   */
  public setLoggedIn(loggedIn: boolean): void {
    this.state.loggedIn = loggedIn;
    this.notifyStateChange();
  }

  /**
   * 设置用户详情
   *
   * 更新用户详情并持久化到存储中。
   * 包含用户的基本信息，不包含敏感数据。
   *
   * @param userDetail 用户详情信息，null 表示清除用户信息
   */
  public setUserDetail(userDetail: UserDetail | null): void {
    this.state.userDetail = userDetail;
    if (this.memento) {
      this.memento.update(StateService.STORAGE_KEYS.USER_DETAIL, userDetail);
    }
    this.notifyStateChange();
  }

  /**
   * 获取用户详情
   *
   * 返回当前存储的用户详情信息。
   *
   * @returns 用户详情信息，未登录时返回 null
   */
  public getUserDetail(): UserDetail | null {
    return this.state.userDetail;
  }

  /**
   * 获取服务器 URL
   *
   * 返回当前配置的服务器地址。
   *
   * @returns 服务器地址，未配置时返回 null
   */
  public getServerUrl(): string | null {
    return this.state.serverUrl;
  }

  /**
   * 获取登录账号
   *
   * 从持久化存储中获取保存的登录账号。
   *
   * @returns 登录账号，未保存时返回 undefined
   */
  public getAccount(): string | undefined {
    if (!this.memento) {
      return undefined;
    }
    return this.memento.get<string>(StateService.STORAGE_KEYS.ACCOUNT);
  }

  /**
   * 获取登录密码（MD5加密后的）
   *
   * 从持久化存储中获取保存的加密密码。
   *
   * @returns 加密后的密码，未保存时返回 undefined
   */
  public getPassword(): string | undefined {
    if (!this.memento) {
      return undefined;
    }
    return this.memento.get<string>(StateService.STORAGE_KEYS.PASSWORD);
  }

  /**
   * 保存登录凭据
   *
   * 将账号和密码持久化到存储中。
   * 密码以 MD5 加密形式存储，提高安全性。
   *
   * @param account 用户账号
   * @param password 加密后的密码
   */
  public async saveCredentials(
    account: string,
    password: string,
  ): Promise<void> {
    if (this.memento) {
      await this.memento.update(StateService.STORAGE_KEYS.ACCOUNT, account);
      await this.memento.update(StateService.STORAGE_KEYS.PASSWORD, password);
    }
  }

  /**
   * 清除登录凭据
   *
   * 从持久化存储中删除所有登录相关信息。
   * 包括账号、密码和用户详情。
   */
  public async clearCredentials(): Promise<void> {
    if (this.memento) {
      await this.memento.update(StateService.STORAGE_KEYS.ACCOUNT, undefined);
      await this.memento.update(StateService.STORAGE_KEYS.PASSWORD, undefined);
      await this.memento.update(
        StateService.STORAGE_KEYS.USER_DETAIL,
        undefined,
      );
    }
  }

  /**
   * 通知状态变更
   *
   * 调用所有注册的监听器，传递当前状态。
   * 使用 try-catch 保护监听器执行，避免单个监听器错误影响其他监听器。
   */
  private notifyStateChange(): void {
    const currentState = this.getState();
    this.stateChangeListeners.forEach(listener => {
      try {
        listener(currentState);
      } catch {
        // ignore
      }
    });
  }

  /**
   * 重置所有状态
   *
   * 将所有状态重置为初始值。
   * 用于登出或清除所有用户数据时。
   */
  public reset(): void {
    this.state = {
      serverUrl: null,
      connectionOk: false,
      loggedIn: false,
      userDetail: null,
      editData: null,
      queryContext: null,
      columnConfig: null,
      addData: null,
    };
    this.notifyStateChange();
  }

  /**
   * 设置编辑数据
   *
   * 保存用户编辑过的表格数据到持久化存储。
   * 用于在会话间保持用户的编辑状态。
   *
   * @param editData 编辑数据，null 表示清除编辑数据
   */
  public setEditData(editData: Record<string, ReviewCommentItem> | null): void {
    this.state.editData = editData;
    if (this.memento) {
      this.memento.update(StateService.STORAGE_KEYS.EDIT_DATA, editData);
    }
    this.notifyStateChange();
  }

  /**
   * 获取编辑数据
   *
   * 从持久化存储中获取用户编辑过的表格数据。
   * 优先返回持久化数据，如果不存在则返回内存中的数据。
   *
   * @returns 编辑数据，无数据时返回 null
   */
  public getEditData(): Record<string, ReviewCommentItem> | null {
    if (!this.memento) {
      return this.state.editData;
    }
    const storedData = this.memento.get<Record<string, ReviewCommentItem>>(
      StateService.STORAGE_KEYS.EDIT_DATA,
    );
    if (storedData !== undefined) {
      return storedData;
    }
    return this.state.editData;
  }

  /**
   * 设置查询上下文
   *
   * 保存当前的查询条件（项目ID和筛选类型）到持久化存储。
   * 用于在会话间保持用户的查询偏好。
   *
   * @param queryContext 查询上下文，null 表示清除查询条件
   */
  public setQueryContext(queryContext: QueryContext | null): void {
    this.state.queryContext = queryContext;
    if (this.memento) {
      this.memento.update(
        StateService.STORAGE_KEYS.QUERY_CONTEXT,
        queryContext,
      );
    }
    this.notifyStateChange();
  }

  /**
   * 获取查询上下文
   *
   * 返回当前保存的查询条件。
   *
   * @returns 查询上下文，无数据时返回 null
   */
  public getQueryContext(): QueryContext | null {
    return this.state.queryContext;
  }

  /**
   * 获取当前选中的项目ID
   *
   * 从查询上下文中提取项目ID。
   * 用于确定当前查询的项目范围。
   *
   * @returns 项目ID，未选择时返回 undefined
   */
  public getCurrentProjectId(): number | undefined {
    return this.state.queryContext?.projectId;
  }

  /**
   * 获取当前选中的筛选类型
   *
   * 从查询上下文中提取筛选类型。
   * 用于确定当前查询的筛选条件。
   *
   * @returns 筛选类型，未选择时返回 undefined
   */
  public getCurrentFilterType(): EnumReviewListFilter | undefined {
    return this.state.queryContext?.filterType;
  }

  /**
   * 设置列配置数据
   *
   * 保存列配置数据到持久化存储。
   * 列配置包含表格的显示和编辑规则。
   *
   * @param columnConfig 列配置数组，null 表示清除配置
   */
  public setColumnConfig(columnConfig: ColumnConfig[] | null): void {
    this.state.columnConfig = columnConfig;
    if (this.memento) {
      this.memento.update(
        StateService.STORAGE_KEYS.COLUMN_CONFIG,
        columnConfig,
      );
    }
    this.notifyStateChange();
  }

  /**
   * 获取列配置数据
   *
   * 从持久化存储中获取列配置数据。
   * 优先返回持久化数据，如果不存在则返回内存中的数据。
   *
   * @returns 列配置数组，无数据时返回 null
   */
  public getColumnConfig(): ColumnConfig[] | null {
    if (!this.memento) {
      return this.state.columnConfig;
    }

    const storedData = this.memento.get<ColumnConfig[]>(
      StateService.STORAGE_KEYS.COLUMN_CONFIG,
    );

    if (storedData !== undefined) {
      return storedData;
    }

    return this.state.columnConfig;
  }

  /**
   * 保存新增数据
   *
   * 保存新增的评审意见到临时存储中。
   * 新增的数据会与现有数据合并，新增的在最前面。
   *
   * @param comment 新增的评审意见数据，null 表示清除数据
   */
  public saveAddData(comment: Record<string, ReviewCommentItem> | null): void {
    const currentComments = this.state.addData || {};

    // 合并新增的评审意见到现有数据中，新增的在最前面
    const allNewComments = { ...(comment || {}), ...currentComments };

    this.state.addData = allNewComments;

    if (this.memento) {
      this.memento.update(StateService.STORAGE_KEYS.ADD_DATA, allNewComments);
    }
    this.notifyStateChange();
  }

  /**
   * 获取新增的评审意见
   *
   * 返回当前临时存储的新增评审意见。
   * 优先返回持久化数据，如果不存在则返回内存中的数据。
   *
   * @returns 新增评审意见数据，无数据时返回空对象
   */
  public getAddData(): Record<string, ReviewCommentItem> {
    if (!this.memento) {
      return this.state.addData || {};
    }

    const storedData = this.memento.get<Record<string, ReviewCommentItem>>(
      StateService.STORAGE_KEYS.ADD_DATA,
    );

    if (storedData !== undefined) {
      return storedData;
    }

    return this.state.addData || {};
  }

  /**
   * 清空新增数据
   *
   * 清理临时存储的新增数据，支持删除指定数据或全部清空。
   * 用于清理不再需要的数据或重置状态。
   *
   * 执行流程：
   * 1. 如果不传ID，清空所有新增数据
   * 2. 如果传入ID，删除指定记录
   * 3. 如果删除后没有数据，设置为null
   * 4. 更新持久化存储并通知状态变更
   *
   * @param id 可选的记录ID，不传则清空所有数据，传入则删除指定记录
   */
  public clearAddData(id?: string): void {
    if (!id) {
      // 不传ID时，清空所有新增数据
      this.state.addData = null;

      if (this.memento) {
        this.memento.update(StateService.STORAGE_KEYS.ADD_DATA, null);
      }
    } else {
      // 传入ID时，删除指定记录
      if (this.state.addData && this.state.addData[id]) {
        const newAddData = { ...this.state.addData };
        Reflect.deleteProperty(newAddData, id);

        // 如果删除后没有数据了，设置为null
        this.state.addData =
          Object.keys(newAddData).length > 0 ? newAddData : null;

        if (this.memento) {
          this.memento.update(
            StateService.STORAGE_KEYS.ADD_DATA,
            this.state.addData,
          );
        }
      }
    }

    this.notifyStateChange();
  }
}
