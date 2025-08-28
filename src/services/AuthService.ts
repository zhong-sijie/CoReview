import * as crypto from "node:crypto";
import { EnumHttpMethod } from "../../shared/enums";
import type { CheckAuthResponse, LoginRequest } from "../../shared/types";
import { requestApi } from "../utils/request";
import { StateService } from "./StateService";

/**
 * 鉴权服务（扩展端）
 *
 * 职责：
 * - 负责发起"连接测试"和"登录"请求
 * - 处理登录相关的业务逻辑
 * - 通过 StateService 管理状态变更
 *
 * 关键设计：
 * - 专注于接口调用和业务逻辑
 * - 状态管理委托给 StateService
 * - 保持接口调用的纯净性
 */
export class AuthService {
  /** 单例实例 */
  private static instance: AuthService;

  /** 状态服务实例，用于管理登录状态和用户信息 */
  private stateService: StateService;

  /**
   * 私有构造函数
   *
   * 防止外部直接实例化，强制使用单例模式
   */
  private constructor() {
    this.stateService = StateService.getInstance();
  }

  /**
   * 获取AuthService的单例实例
   *
   * 如果实例不存在则创建新实例，如果已存在则返回现有实例
   */
  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * 连接测试
   *
   * 测试与后端服务器的网络连通性，成功后更新服务器地址配置
   *
   * 执行流程：
   * 1. 校验服务器地址格式（必须是 http/https）
   * 2. 调用 /client/system/checkConnection 接口
   * 3. 成功后通过 StateService 更新服务器地址和连接状态
   */
  public async loadTestConnection(serverUrl: string): Promise<boolean> {
    const normalizedServerUrl = serverUrl?.trim();

    // 校验是否是合法的 URL
    if (!/^https?:\/\//i.test(normalizedServerUrl)) {
      return Promise.reject(new Error("Invalid server URL"));
    }

    try {
      await requestApi({
        url: `${normalizedServerUrl}/client/system/checkConnection`,
        method: EnumHttpMethod.Get,
        requestOptions: {
          skipAuth: true,
        },
      });

      // 连接成功: 通过 StateService 更新服务器地址
      this.stateService.setServerUrl(normalizedServerUrl);
      this.stateService.setConnectionOk(true);
      return Promise.resolve(true);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   * 用户登录
   *
   * 使用用户名和密码进行身份验证，成功后保存登录状态
   *
   * 执行流程：
   * 1. 标准化用户名和密码（去除空格）
   * 2. 对密码执行 MD5 加密（32位十六进制）
   * 3. 调用 /client/system/checkAuth 接口进行验证
   * 4. 校验响应结果，失败则抛出错误
   * 5. 成功后通过 StateService 保存登录信息并更新状态
   */
  public async loadLogin(username: string, password: string): Promise<boolean> {
    const normalizedUsername = String(username || "").trim();
    const normalizedPassword = String(password || "").trim();

    // 按接口要求对密码做 MD5
    const md5Password = crypto
      .createHash("md5")
      .update(normalizedPassword)
      .digest("hex");

    const data = await requestApi<CheckAuthResponse>({
      url: "/client/system/checkAuth",
      method: EnumHttpMethod.Post,
      data: {
        account: normalizedUsername,
        password: md5Password,
      } as LoginRequest,
      requestOptions: {
        skipAuth: true,
      },
    });

    if (!data?.pass) {
      throw new Error(data?.message || "登录失败: 账号或密码错误");
    }

    // 通过 StateService 保存登录信息并更新状态
    await this.stateService.saveCredentials(normalizedUsername, md5Password);
    this.stateService.setUserDetail(null);
    this.stateService.setLoggedIn(true);
    this.stateService.setConnectionOk(true);

    return true;
  }

  /**
   * 用户登出
   *
   * 清除登录凭据并重置登录状态
   *
   * 执行流程：
   * 1. 通过 StateService 清除登录凭据
   * 2. 通过 StateService 重置登录状态
   * 3. 设置连接状态为失败
   */
  public async loadLogout(): Promise<void> {
    // 通过 StateService 清除登录凭据
    await this.stateService.clearCredentials();

    // 通过 StateService 重置登录状态
    this.stateService.setLoggedIn(false);
    this.stateService.setUserDetail(null);
    this.stateService.setConnectionOk(false);
  }
}
