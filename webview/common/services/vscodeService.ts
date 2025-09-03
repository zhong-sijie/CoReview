import { EnumLogLevel, EnumMessageType } from '@shared/enums';
import type {
  AllMessagePayloads,
  AsyncResult,
  ExtensionMessage,
  Message,
} from '@shared/types';
import { createUniqueId } from '@shared/utils';

/**
 * VS Code 服务模块
 *
 * 提供与VS Code扩展端通信的核心服务，包括消息发送、接收、回调处理等。
 * 负责WebView与Extension Host之间的双向通信。
 *
 * 主要功能：
 * - 初始化VS Code API连接
 * - 消息发送和接收
 * - 异步回调处理
 * - 消息处理器注册和管理
 * - 认证状态的特殊处理
 */

/** VS Code API 实例，用于与扩展端通信 */
let vscode: {
  postMessage: (message: { type: string; payload: AllMessagePayloads }) => void;
};

/**
 * 消息处理器映射表
 *
 * 存储不同类型消息的处理函数，支持普通消息和回调消息。
 * key: 消息类型，value: 处理函数
 */
const messageHandlers: Map<
  string,
  ((message: Message<unknown>) => void) | ((result: AsyncResult) => void)
> = new Map();

/**
 * 认证状态处理器集合
 *
 * 支持多个处理器监听认证状态变化，使用Set避免重复注册。
 * 认证状态消息会广播给所有注册的处理器。
 */
const authStateHandlers: Set<(message: ExtensionMessage<unknown>) => void> =
  new Set();

/**
 * 初始化 VSCode 服务
 *
 * 必须在应用启动时调用一次，设置与VS Code扩展端的通信。
 * 获取VS Code API并注册消息监听器。
 *
 * 执行流程：
 * 1. 获取VS Code API实例
 * 2. 注册window消息监听器
 * 3. 建立与扩展端的通信通道
 */
export function initializeVSCodeService(): void {
  // 获取VSCode API
  if (typeof window !== 'undefined' && window.acquireVsCodeApi) {
    vscode = window.acquireVsCodeApi();
    reportLog(EnumLogLevel.INFO, 'VSCode API 初始化完成');
  }

  // 监听来自扩展的消息
  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data as ExtensionMessage;
    reportLog(EnumLogLevel.DEBUG, '收到扩展消息', { type: message?.type });
    handleMessage(message);
  });
}

/**
 * 处理来自扩展的消息
 *
 * 根据消息类型分发到对应的处理器，支持普通消息和回调消息。
 * 认证状态消息有特殊的广播处理机制。
 *
 * 执行流程：
 * 1. 检查是否为认证状态消息，如果是则广播给所有处理器
 * 2. 查找对应的消息处理器
 * 3. 根据消息类型（普通消息或回调消息）调用相应的处理函数
 * 4. 回调消息使用后自动清理
 */
function handleMessage(message: ExtensionMessage<unknown>): void {
  // 特殊处理 AuthState 消息
  if (message.type === EnumMessageType.AuthState) {
    authStateHandlers.forEach(handler => {
      try {
        handler(message);
      } catch {
        // ignore
      }
    });
    return;
  }

  const handler = messageHandlers.get(message.type);

  if (handler) {
    // 回调消息: 以 cb: 前缀标识
    if (typeof message.type === 'string' && message.type.startsWith('cb:')) {
      try {
        (handler as (result: AsyncResult) => void)(
          message.payload as AsyncResult,
        );
      } finally {
        // 一次性回调，使用后清理
        messageHandlers.delete(message.type);
      }
      return;
    }
    // 普通消息
    (handler as (message: ExtensionMessage<unknown>) => void)(message);
    return;
  }
}

/**
 * 发送消息到扩展（Extension Host）
 *
 * 向VS Code扩展端发送消息，不等待响应。
 * 适用于单向通知类消息。
 *
 * @param type 消息类型
 * @param payload 消息负载
 */
export function postMessage(
  type: EnumMessageType,
  payload: AllMessagePayloads,
): void {
  if (vscode) {
    // 避免对日志上报自身再次打点，防止循环
    if (type !== EnumMessageType.WebviewLogReport) {
      reportLog(EnumLogLevel.DEBUG, type, { ...payload });
    }

    vscode.postMessage({ type, payload });
  }
}

/**
 * 向扩展端上报日志
 *
 * 使用统一的消息类型 WebviewLogReport，将前端日志转发到扩展端落盘。
 * @param level 日志级别：'info' | 'warn' | 'error' | 'debug'
 * @param message 简要描述
 * @param data 附加数据
 */
export function reportLog(
  level: EnumLogLevel,
  message: string,
  data?: Record<string, any>,
): void {
  if (vscode) {
    const app = ((window as any)?.__COREVIEW_APP as string) || '';

    const { context = '', ...rest } = data || {};

    postMessage(EnumMessageType.WebviewLogReport, {
      level,
      message: `[webview ${app}] ${message}`,
      data: rest,
      timestamp: new Date().toISOString(),
      context,
    });
  }
}

/**
 * 发送消息到扩展并等待回调
 *
 * 向VS Code扩展端发送消息，并注册回调函数等待响应。
 * 回调会收到包含success和error字段的结果对象。
 *
 * 执行流程：
 * 1. 生成唯一的回调ID（以cb:前缀标识）
 * 2. 将回调函数存储到messageHandlers中
 * 3. 发送包含callbackId的消息到扩展端
 * 4. 扩展端处理完成后会发送回调消息
 * 5. 回调消息触发对应的处理函数并自动清理
 *
 * @param type 消息类型
 * @param payload 消息负载
 * @param callback 回调函数，接收异步操作结果
 */
export function postMessageWithCallback(
  type: EnumMessageType,
  payload: unknown,
  callback: (result: AsyncResult) => void,
): void {
  if (vscode) {
    // 生成唯一的回调ID
    const callbackId = 'cb:' + createUniqueId();

    // 存储回调函数
    messageHandlers.set(callbackId, callback);

    // 发送消息，包含回调ID
    const basePayload = payload || {};

    postMessage(type, {
      ...basePayload,
      callbackId,
    });
  }
}

/**
 * 注册消息处理器
 *
 * 为指定类型的消息注册处理函数。
 * 认证状态消息支持多个处理器，其他消息类型只能有一个处理器。
 *
 * @param type 消息类型
 * @param handler 消息处理函数
 */
export function onMessage<TPayload = unknown>(
  type: EnumMessageType,
  handler: (message: ExtensionMessage<TPayload>) => void,
): void {
  // 特殊处理 AuthState 消息，支持多个处理器
  if (type === EnumMessageType.AuthState) {
    authStateHandlers.add(
      handler as unknown as (message: ExtensionMessage<unknown>) => void,
    );
  } else {
    messageHandlers.set(type, handler as (message: Message<unknown>) => void);
  }

  try {
    reportLog(EnumLogLevel.INFO, '注册消息处理器', { type });
  } catch {
    // ignore
  }
}

/**
 * 移除消息处理器
 *
 * 移除指定类型消息的处理函数。
 * 认证状态消息需要指定具体的处理器函数，其他消息类型直接移除。
 *
 * @param type 消息类型
 * @param handler 要移除的处理函数（认证状态消息需要）
 */
export function removeMessageHandler<TPayload = unknown>(
  type: EnumMessageType,
  handler: (message: ExtensionMessage<TPayload>) => void,
): void {
  if (type === EnumMessageType.AuthState) {
    authStateHandlers.delete(
      handler as unknown as (message: ExtensionMessage<unknown>) => void,
    );
  } else {
    messageHandlers.delete(type);
  }

  reportLog(EnumLogLevel.INFO, '移除消息处理器', { type });
}
