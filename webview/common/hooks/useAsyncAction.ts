import { useCallback, useState } from 'react';
import { EnumMessageType } from '@shared/enums';
import type { AsyncResult } from '@shared/types';
import { postMessageWithCallback } from '../services/vscodeService';

/**
 * 简单的异步操作 hook
 *
 * 自动管理异步操作的loading状态，提供统一的异步操作执行接口。
 * 主要用于与VS Code扩展端进行消息通信，并处理回调结果。
 *
 * 主要功能：
 * - 自动管理loading状态
 * - 提供统一的异步操作执行函数
 * - 支持与扩展端的消息通信
 * - 返回Promise形式的操作结果
 */
export function useAsyncAction() {
  /** 异步操作的加载状态 */
  const [loading, setLoading] = useState(false);

  /**
   * 执行异步操作
   *
   * 向VS Code扩展端发送消息并等待回调结果。
   * 自动管理loading状态，在操作开始时设置为true，完成后设置为false。
   *
   * 执行流程：
   * 1. 设置loading状态为true
   * 2. 向扩展端发送消息
   * 3. 等待回调结果
   * 4. 设置loading状态为false
   * 5. 返回操作结果
   *
   * @param type 消息类型，对应EnumMessageType中的枚举值
   * @param payload 消息负载，包含要发送的数据
   * @returns Promise<AsyncResult> 异步操作的结果
   */
  const execute = useCallback(
    (
      type: EnumMessageType,
      payload: Record<string, unknown> | undefined,
    ): Promise<AsyncResult> => {
      setLoading(true);
      return new Promise<AsyncResult>(resolve => {
        postMessageWithCallback(type, payload, result => {
          setLoading(false);
          resolve(result);
        });
      });
    },
    [],
  );

  return {
    loading,
    execute,
  };
}
