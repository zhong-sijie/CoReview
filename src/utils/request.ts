// 导入 axios 核心模块和类型定义
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { EnumHttpMethod } from '../../shared/enums';
import { AuthService } from '../services/AuthService';
import { LogService } from '../services/LogService';
import { StateService } from '../services/StateService';

/**
 * Axios 请求封装（VS Code 扩展端）
 *
 * 提供统一的HTTP请求封装，支持认证、拦截器、错误处理等功能。
 * 采用单例模式管理 axios 实例，避免重复创建，提高性能。
 *
 * 主要特性：
 * - 单例 axios 实例，避免重复创建
 * - 请求/响应拦截器：自动注入认证信息和处理错误
 * - 类型安全的请求函数和快捷方法
 * - 文件上传/下载支持（Node 环境）
 * - 统一响应格式处理
 */

/**
 * 请求选项接口
 *
 * 定义请求时的自定义选项，用于控制请求行为。
 */
export interface RequestOptions {
  /** 是否跳过认证（用于白名单接口，如连接测试、登录等） */
  skipAuth?: boolean;
}

/**
 * 扩展的请求配置类型
 *
 * 在axios标准配置基础上增加自定义请求选项。
 * 支持透传自定义选项到拦截器中。
 */
export type RequestConfig<TData = unknown> = AxiosRequestConfig<TData> & {
  /** 自定义请求选项 */
  requestOptions?: RequestOptions;
};

/**
 * 统一响应信封接口
 *
 * 与后端API对齐的统一响应格式，包含状态码、消息和数据。
 */
export interface ApiEnvelope<T> {
  /** 响应状态码，0 表示成功 */
  code: number;
  /** 响应消息 */
  message: string;
  /** 响应数据 */
  data: T;
}

/** 默认请求超时时间（15秒） */
const DEFAULT_TIMEOUT_MS = 15_000;

/** 全局 axios 实例（单例模式），避免重复创建 */
let axiosInstance: AxiosInstance | null = null;

/** 额外的默认请求头，支持动态添加 */
let extraDefaultHeaders: Record<string, string> = {};

/** 日志服务（模块级单例缓存） */
const log = LogService.getInstance();

/**
 * 确保 axios 实例已创建并返回实例
 *
 * 使用单例模式，避免重复创建axios实例，提高性能。
 * 在首次调用时创建实例并配置拦截器。
 *
 * 执行流程：
 * 1. 检查实例是否已存在，存在则直接返回
 * 2. 创建新的axios实例，配置基础URL、超时时间、默认请求头
 * 3. 配置请求拦截器，注入User-Agent和认证信息
 * 4. 配置响应拦截器，处理401错误和统一错误处理
 * 5. 返回配置完成的实例
 *
 * @returns 配置完成的 axios 实例
 */
function ensureInstance(): AxiosInstance {
  // 如果实例已存在，直接返回
  if (axiosInstance) {
    return axiosInstance;
  }

  const stateService = StateService.getInstance();
  const authService = AuthService.getInstance();

  // 创建新的 axios 实例
  axiosInstance = axios.create({
    /** 设置基础 URL */
    baseURL: stateService.getServerUrl() || undefined,
    /** 设置默认超时时间 */
    timeout: DEFAULT_TIMEOUT_MS,
    /** 设置默认请求头 */
    headers: {
      /** 默认内容类型 */
      'Content-Type': 'application/json',
      /** 合并额外默认头 */
      ...extraDefaultHeaders,
    },
  });

  // 请求拦截器: 注入 UA、Account、Password
  axiosInstance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // 打点：请求开始时间
      (config as any)._startedAt = Date.now();
      // 确保 headers 对象存在
      config.headers = config.headers ?? {};

      // 设置 VS Code 扩展的 User-Agent
      config.headers['User-Agent'] =
        config.headers['User-Agent'] || 'CoReview-Extension';

      // 检查是否需要跳过认证
      const skipAuth = (config as any).requestOptions?.skipAuth;
      // 如果有账号密码且不需要跳过认证，则添加账号密码到请求头
      if (!skipAuth) {
        const account = stateService.getAccount();
        const password = stateService.getPassword();
        if (account && password) {
          config.headers.account = account;
          config.headers.pwd = password;
        }
      }

      // 合并默认 headers
      Object.assign(config.headers, extraDefaultHeaders);

      try {
        const headers = { ...(config.headers as any) } as Record<string, any>;
        if ('pwd' in headers) {
          headers.pwd = '***';
        }
        log.debug('发起请求', 'request', {
          method: config.method,
          url: config.baseURL ? `${config.baseURL}${config.url}` : config.url,
          headers,
          params: (config as any).params,
          data: (config as any).data,
          skipAuth,
        });
      } catch {
        // ignore log errors
      }
      return config;
    },
  );

  // 响应拦截器
  axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => {
      try {
        const cfg = response.config as any;
        const startedAt = cfg?._startedAt as number | undefined;
        const durationMs = startedAt ? Date.now() - startedAt : undefined;
        log.debug('请求成功', 'request', {
          method: response.config?.method,
          url: response.config?.baseURL
            ? `${response.config.baseURL}${response.config.url}`
            : response.config?.url,
          status: response.status,
          durationMs,
        });
      } catch {
        // ignore
      }

      return response;
    },
    async (error: AxiosError) => {
      // 处理 401 未授权错误，自动调用登出逻辑
      if (error.response?.status === 401) {
        try {
          await authService.loadLogout();
        } catch {
          // ignore
        }
      }

      // 记录错误响应
      try {
        const cfg = error.config as any;
        const startedAt = cfg?._startedAt as number | undefined;
        const durationMs = startedAt ? Date.now() - startedAt : undefined;
        log.error('请求失败', 'request', {
          method: cfg?.method,
          url: cfg?.baseURL ? `${cfg.baseURL}${cfg.url}` : cfg?.url,
          status: error.response?.status,
          code: (error as any)?.code,
          message: error.message,
          durationMs,
        });
      } catch {
        // ignore
      }
      return Promise.reject(error); // 错误响应继续抛出
    },
  );

  return axiosInstance;
}

/**
 * 核心请求函数
 *
 * 执行HTTP请求的核心函数，确保axios实例已创建并处理请求配置。
 * 支持自定义请求选项的透传，供拦截器读取和处理。
 *
 * 执行流程：
 * 1. 确保axios实例已创建
 * 2. 分离请求选项和axios配置
 * 3. 将自定义requestOptions透传给axios配置
 * 4. 执行请求并返回响应
 *
 * @param config 请求配置，包含自定义选项和axios标准配置
 * @returns HTTP响应对象
 */
export async function request<T = unknown, D = unknown>(
  config: RequestConfig<D>,
): Promise<AxiosResponse<T>> {
  // 确保 axios 实例已创建
  const instance = ensureInstance();

  // 分离请求选项和 axios 配置
  const { requestOptions, ...axiosConfig } = config;
  // 将自定义 requestOptions 透传进 axios config，供拦截器读取
  if (requestOptions) {
    (axiosConfig as any).requestOptions = requestOptions;
  }

  // 执行请求
  return instance.request<T, AxiosResponse<T>, D>(axiosConfig);
}

/**
 * 请求数据函数
 *
 * 直接返回响应数据，不包含响应头等信息。
 * 简化了响应处理，只关注业务数据。
 *
 * @param config 请求配置
 * @returns 响应数据
 */
export async function requestData<T = unknown, D = unknown>(
  config: RequestConfig<D>,
): Promise<T> {
  const resp = await request<T, D>(config);
  return resp.data as T;
}

/**
 * API 请求函数
 *
 * 自动处理统一响应信封格式，对非成功状态码抛出错误。
 * 这是最常用的请求函数，适用于标准的API调用。
 *
 * 执行流程：
 * 1. 调用request函数获取响应
 * 2. 检查响应状态码，非0表示失败
 * 3. 失败时抛出错误，成功时返回数据部分
 *
 * @param config 请求配置
 * @returns API响应数据
 */
export async function requestApi<T = unknown, D = unknown>(
  config: RequestConfig<D>,
): Promise<T> {
  const resp = await request<ApiEnvelope<T>, D>(config);
  const body = resp.data;

  // 检查响应状态码，非 0 表示失败
  if (body.code !== 0) {
    const error = new Error(body.message || 'Request failed');
    (error as any).code = body.code; // 添加错误码
    throw error;
  }

  return body.data as T;
}

/**
 * GET 请求
 *
 * 执行GET请求的快捷方法，简化常用请求的调用。
 *
 * @param url 请求URL
 * @param config 可选的请求配置
 * @returns 响应数据
 */
export async function get<T = unknown>(
  url: string,
  config?: RequestConfig,
): Promise<T> {
  return requestData<T>({ ...config, method: 'GET', url });
}

/**
 * DELETE 请求
 *
 * 执行DELETE请求的快捷方法，简化常用请求的调用。
 *
 * @param url 请求URL
 * @param config 可选的请求配置
 * @returns 响应数据
 */
export async function del<T = unknown>(
  url: string,
  config?: RequestConfig,
): Promise<T> {
  return requestData<T>({ ...config, method: 'DELETE', url });
}

/**
 * POST 请求
 *
 * 执行POST请求的快捷方法，支持发送数据。
 *
 * @param url 请求URL
 * @param data 请求数据
 * @param config 可选的请求配置
 * @returns 响应数据
 */
export async function post<T = unknown, D = unknown>(
  url: string,
  data?: D,
  config?: RequestConfig<D>,
): Promise<T> {
  return requestData<T, D>({ ...config, method: 'POST', url, data });
}

/**
 * PUT 请求
 *
 * 执行PUT请求的快捷方法，支持发送数据。
 *
 * @param url 请求URL
 * @param data 请求数据
 * @param config 可选的请求配置
 * @returns 响应数据
 */
export async function put<T = unknown, D = unknown>(
  url: string,
  data?: D,
  config?: RequestConfig<D>,
): Promise<T> {
  return requestData<T, D>({ ...config, method: 'PUT', url, data });
}

/**
 * PATCH 请求
 *
 * 执行PATCH请求的快捷方法，支持发送数据。
 *
 * @param url 请求URL
 * @param data 请求数据
 * @param config 可选的请求配置
 * @returns 响应数据
 */
export async function patch<T = unknown, D = unknown>(
  url: string,
  data?: D,
  config?: RequestConfig<D>,
): Promise<T> {
  return requestData<T, D>({ ...config, method: 'PATCH', url, data });
}

/**
 * 文件上传函数
 *
 * 使用 multipart/form-data 格式上传文件。
 * 自动设置正确的内容类型，支持FormData格式的数据。
 *
 * 执行流程：
 * 1. 设置multipart/form-data内容类型
 * 2. 调用POST请求上传文件数据
 *
 * @param url 上传URL
 * @param formData 表单数据，包含文件信息
 * @param config 可选的请求配置
 * @returns 上传响应数据
 */
export async function upload<T = unknown>(
  url: string,
  formData: FormData,
  config?: RequestConfig,
): Promise<T> {
  // 设置 multipart/form-data 内容类型
  const headers = { 'Content-Type': 'multipart/form-data' } as Record<
    string,
    string
  >;

  return requestData<T>({
    url,
    method: EnumHttpMethod.Post,
    data: formData as unknown as Record<string, unknown>,
    headers,
    ...config,
  });
}

/**
 * 文件下载函数
 *
 * 下载文件并返回二进制Buffer。
 * 适用于下载各种类型的文件，如图片、文档等。
 *
 * 执行流程：
 * 1. 请求二进制数据，设置responseType为arraybuffer
 * 2. 将ArrayBuffer转换为Node.js Buffer
 * 3. 返回文件内容的Buffer
 *
 * @param url 下载URL
 * @param config 可选的请求配置
 * @returns 文件内容的Buffer
 */
export async function download(
  url: string,
  config?: RequestConfig,
): Promise<Buffer> {
  // 请求二进制数据
  const resp = await request<ArrayBuffer>({
    url,
    method: EnumHttpMethod.Get,
    /** 指定响应类型为二进制 */
    responseType: 'arraybuffer',
    ...config,
  });

  // 将 ArrayBuffer 转换为 Node.js Buffer
  return Buffer.from(resp.data);
}
