import * as vscode from "vscode";
import { EnumReviewListFilter } from "../../shared/enums";
import { QueryContext } from "../../shared/types";

/**
 * 应用状态接口
 */
export interface AppState {
  /** 已保存的服务端地址（示例: https://your-company-coreview.example.com） */
  serverUrl: string | null;
  /** 最近一次连接测试是否成功（true 代表允许输入账号/密码并尝试登录） */
  connectionOk: boolean;
  /** 登录态（基于服务器地址、账号、密码是否同时存在得出） */
  loggedIn: boolean;
  /** 登录后服务端返回的用户详情（用于页面展示，不包含敏感 token） */
  userDetail?: unknown | null;
  /** 编辑数据存储（保存用户编辑过的表格数据） */
  editData: Record<string, any> | null;
  /** 查询上下文（项目ID和筛选类型） */
  queryContext: QueryContext | null;
}

/**
 * 全局状态管理服务
 *
 * 职责:
 * - 管理与持久化所有应用状态
 * - 提供状态变更通知机制
 * - 统一的状态存储和恢复逻辑
 *
 * 关键设计:
 * - 全局存储键（globalState）
 *   - coreview.baseUrl: 服务端基础地址
 *   - coreview.account: 登录账号
 *   - coreview.password: 登录密码（MD5加密后的）
 *   - coreview.userDetail: 用户详情
 * - 状态变更通知: 通过事件机制通知状态变更
 */
export class StateService {
  /** 单例实例 */
  private static instance: StateService;

  /** VS Code 全局状态存储对象 */
  private memento: vscode.Memento | null = null;

  /**
   * 全局存储键名: 用于在 VS Code globalState 中持久化数据
   */
  private static readonly STORAGE_KEYS = {
    /** 服务端基础地址（字符串） */
    BASE_URL: "coreview.baseUrl",
    /** 登录账号（字符串） */
    ACCOUNT: "coreview.account",
    /** 登录密码（MD5加密后的字符串） */
    PASSWORD: "coreview.password",
    /** 用户详情（任意可序列化结构） */
    USER_DETAIL: "coreview.userDetail",
    /** 编辑数据（用户编辑过的表格数据） */
    EDIT_DATA: "coreview.editData",
    /** 查询上下文（项目ID和筛选类型） */
    QUERY_CONTEXT: "coreview.queryContext",
  } as const;

  /** 当前应用状态 */
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
  };

  /** 状态变更事件监听器 */
  private stateChangeListeners: Array<(state: AppState) => void> = [];

  /**
   * 私有构造函数
   *
   * 防止外部直接实例化，强制使用单例模式
   */
  private constructor() {}

  /**
   * 获取StateService的单例实例
   *
   * 如果实例不存在则创建新实例，如果已存在则返回现有实例
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
   * 设置VS Code扩展上下文，并从持久化存储中恢复状态
   */
  public initialize(context: vscode.ExtensionContext): void {
    this.memento = context.globalState;
    this.loadStateFromStorage();
  }

  /**
   * 从持久化存储加载状态
   *
   * 从VS Code的globalState中恢复之前保存的状态数据
   */
  private loadStateFromStorage(): void {
    if (!this.memento) {
      return;
    }

    // 加载服务器地址
    const savedServerUrl = this.memento.get<string>(
      StateService.STORAGE_KEYS.BASE_URL
    );

    if (savedServerUrl && typeof savedServerUrl === "string") {
      this.state.serverUrl = savedServerUrl;
    }

    // 加载账号、密码与用户信息
    const savedAccount = this.memento.get<string>(
      StateService.STORAGE_KEYS.ACCOUNT
    );
    const savedPassword = this.memento.get<string>(
      StateService.STORAGE_KEYS.PASSWORD
    );

    // 如果服务器地址、账号、密码同时存在，则认为用户还处于登录状态
    if (this.state.serverUrl && savedAccount && savedPassword) {
      this.state.loggedIn = true;
    }

    const savedUser = this.memento.get<any>(
      StateService.STORAGE_KEYS.USER_DETAIL
    );
    if (typeof savedUser !== "undefined") {
      this.state.userDetail = savedUser;
    }

    // 加载查询上下文
    const savedQueryContext = this.memento.get<QueryContext>(
      StateService.STORAGE_KEYS.QUERY_CONTEXT
    );
    if (savedQueryContext && typeof savedQueryContext === "object") {
      this.state.queryContext = savedQueryContext;
    }
  }

  /**
   * 获取当前应用状态
   *
   * 返回应用状态的副本，避免外部直接修改内部状态
   */
  public getState(): AppState {
    return { ...this.state };
  }

  /**
   * 设置服务器地址
   *
   * 更新服务器地址并持久化到存储中
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
   * 更新连接状态并通知监听器
   */
  public setConnectionOk(ok: boolean): void {
    this.state.connectionOk = ok;
    this.notifyStateChange();
  }

  /**
   * 设置登录状态
   *
   * 更新登录状态并通知监听器
   */
  public setLoggedIn(loggedIn: boolean): void {
    this.state.loggedIn = loggedIn;
    this.notifyStateChange();
  }

  /**
   * 设置用户详情
   *
   * 更新用户详情并持久化到存储中
   */
  public setUserDetail(userDetail: unknown | null): void {
    this.state.userDetail = userDetail;
    if (this.memento) {
      this.memento.update(StateService.STORAGE_KEYS.USER_DETAIL, userDetail);
    }
    this.notifyStateChange();
  }

  /**
   * 获取服务器 URL
   *
   * 返回当前配置的服务器地址
   */
  public getServerUrl(): string | null {
    return this.state.serverUrl;
  }

  /**
   * 获取登录账号
   *
   * 从持久化存储中获取保存的登录账号
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
   * 从持久化存储中获取保存的加密密码
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
   * 将账号和密码持久化到存储中
   */
  public async saveCredentials(
    account: string,
    password: string
  ): Promise<void> {
    if (this.memento) {
      await this.memento.update(StateService.STORAGE_KEYS.ACCOUNT, account);
      await this.memento.update(StateService.STORAGE_KEYS.PASSWORD, password);
    }
  }

  /**
   * 清除登录凭据
   *
   * 从持久化存储中删除所有登录相关信息
   */
  public async clearCredentials(): Promise<void> {
    if (this.memento) {
      await this.memento.update(StateService.STORAGE_KEYS.ACCOUNT, undefined);
      await this.memento.update(StateService.STORAGE_KEYS.PASSWORD, undefined);
      await this.memento.update(
        StateService.STORAGE_KEYS.USER_DETAIL,
        undefined
      );
    }
  }

  /**
   * 添加状态变更监听器
   *
   * 注册状态变更时的回调函数
   */
  public addStateChangeListener(listener: (state: AppState) => void): void {
    this.stateChangeListeners.push(listener);
  }

  /**
   * 移除状态变更监听器
   *
   * 从监听器列表中移除指定的回调函数
   */
  public removeStateChangeListener(listener: (state: AppState) => void): void {
    const index = this.stateChangeListeners.indexOf(listener);
    if (index > -1) {
      this.stateChangeListeners.splice(index, 1);
    }
  }

  /**
   * 通知状态变更
   *
   * 调用所有注册的监听器，传递当前状态
   */
  private notifyStateChange(): void {
    const currentState = this.getState();
    this.stateChangeListeners.forEach((listener) => {
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
   * 将所有状态重置为初始值
   */
  public reset(): void {
    this.state = {
      serverUrl: null,
      connectionOk: false,
      loggedIn: false,
      userDetail: null,
      editData: null,
      queryContext: null,
    };
    this.notifyStateChange();
  }

  /**
   * 设置编辑数据
   *
   * 保存用户编辑过的表格数据
   */
  public setEditData(editData: Record<string, any> | null): void {
    this.state.editData = editData;
    if (this.memento) {
      this.memento.update(StateService.STORAGE_KEYS.EDIT_DATA, editData);
    }
    this.notifyStateChange();
  }

  /**
   * 获取编辑数据
   *
   * 从持久化存储中获取用户编辑过的表格数据
   */
  public getEditData(): Record<string, any> | null {
    if (!this.memento) {
      return this.state.editData;
    }
    const storedData = this.memento.get<Record<string, any>>(
      StateService.STORAGE_KEYS.EDIT_DATA
    );
    if (storedData !== undefined) {
      return storedData;
    }
    return this.state.editData;
  }

  /**
   * 设置查询上下文
   *
   * 保存当前的查询条件（项目ID和筛选类型）
   */
  public setQueryContext(queryContext: QueryContext | null): void {
    this.state.queryContext = queryContext;
    if (this.memento) {
      this.memento.update(
        StateService.STORAGE_KEYS.QUERY_CONTEXT,
        queryContext
      );
    }
    this.notifyStateChange();
  }

  /**
   * 获取查询上下文
   *
   * 返回当前保存的查询条件
   */
  public getQueryContext(): QueryContext | null {
    return this.state.queryContext;
  }

  /**
   * 获取当前选中的项目ID
   *
   * 从查询上下文中提取项目ID
   */
  public getCurrentProjectId(): number | undefined {
    return this.state.queryContext?.projectId;
  }

  /**
   * 获取当前选中的筛选类型
   *
   * 从查询上下文中提取筛选类型
   */
  public getCurrentFilterType(): EnumReviewListFilter | undefined {
    return this.state.queryContext?.filterType;
  }
}
