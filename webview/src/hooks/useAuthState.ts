import { useEffect, useState } from "react";
import { EnumMessageType } from "@shared/enums";
import type { ExtensionMessage } from "@shared/types";
import {
  onMessage,
  postMessage,
  removeMessageHandler,
} from "../services/vscodeService";

/**
 * 鉴权状态负载类型
 *
 * 定义从扩展端接收的鉴权状态消息的数据结构。
 * 包含登录状态信息。
 */
type AuthStatePayload = { loggedIn?: boolean };

/**
 * 鉴权状态管理 hook
 *
 * 订阅扩展端的鉴权状态变化，并在组件挂载时请求一次最新状态。
 * 提供登录状态的响应式管理，用于页面路由分发和权限控制。
 *
 * 主要功能：
 * - 自动订阅鉴权状态变化
 * - 组件挂载时请求最新状态
 * - 组件卸载时自动清理监听器
 * - 返回响应式的登录状态
 *
 * 使用场景：
 * - 页面路由控制（登录/未登录状态）
 * - 权限控制（显示/隐藏某些功能）
 * - 用户状态展示
 */
export function useAuthState() {
  /** 当前登录状态，默认为false */
  const [loggedIn, setLoggedIn] = useState(false);

  /**
   * 设置消息监听器和初始状态请求
   *
   * 在组件挂载时执行，负责：
   * 1. 注册鉴权状态消息的监听器
   * 2. 向扩展端请求当前鉴权状态
   * 3. 在组件卸载时清理监听器
   */
  useEffect(() => {
    /**
     * 处理鉴权状态消息的回调函数
     *
     * 当接收到扩展端发送的鉴权状态消息时，更新本地状态。
     * 使用双重否定确保loggedIn为布尔类型。
     */
    const handler = (message: ExtensionMessage<AuthStatePayload>) => {
      setLoggedIn(!!message.payload?.loggedIn);
    };

    // 注册消息监听器，监听AuthState类型的消息
    onMessage<AuthStatePayload>(EnumMessageType.AuthState, handler);

    // 向扩展端请求当前鉴权状态
    postMessage(EnumMessageType.GetAuthState, {});

    /**
     * 清理函数
     *
     * 在组件卸载时移除消息监听器，避免内存泄漏。
     * 确保监听器被正确清理。
     */
    return () => {
      removeMessageHandler<AuthStatePayload>(
        EnumMessageType.AuthState,
        handler
      );
    };
  }, []);

  return { loggedIn };
}
