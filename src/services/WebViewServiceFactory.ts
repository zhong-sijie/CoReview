import { LogService } from './LogService';
import { WebViewService } from './WebViewService';

/**
 * WebView 服务工厂类
 *
 * 负责创建和管理不同 Provider 的 WebViewService 实例，
 * 确保每个 Provider 都有独立的消息处理器，避免冲突。
 *
 * 关键设计：
 * - 使用 Map 存储不同 Provider 的服务实例
 * - 支持动态创建和获取服务实例
 * - 提供清理机制，支持资源管理
 */
export class WebViewServiceFactory {
  /** 存储不同 Provider 的 WebViewService 实例，键为 Provider ID */
  private static instances = new Map<string, WebViewService>();

  /** 日志服务实例 */
  private static log = LogService.getInstance();

  /**
   * 创建或获取指定 Provider 的 WebViewService 实例
   *
   * 如果实例不存在则创建新实例，如果已存在则返回现有实例。
   * 确保每个 Provider 都有唯一的服务实例，避免消息处理器冲突。
   *
   * @param providerId Provider 的唯一标识符
   * @returns WebViewService 实例
   */
  static createService(providerId: string): WebViewService {
    if (!this.instances.has(providerId)) {
      this.instances.set(providerId, new WebViewService(providerId));
      this.log.info('创建 WebViewService 实例', 'WebViewServiceFactory', {
        providerId,
      });
    }
    return this.instances.get(providerId)!;
  }

  /**
   * 获取指定 Provider 的 WebViewService 实例
   *
   * 如果实例不存在，返回 undefined。
   * 不会自动创建实例，需要先调用 createService 方法。
   *
   * @param providerId Provider 的唯一标识符
   * @returns WebViewService 实例，如果不存在则返回 undefined
   */
  static getService(providerId: string): WebViewService | undefined {
    return this.instances.get(providerId);
  }

  /**
   * 清理指定 Provider 的 WebViewService 实例
   *
   * 从实例映射中移除指定的服务实例，释放相关资源。
   * 主要用于 Provider 销毁时的清理工作。
   *
   * @param providerId Provider 的唯一标识符
   */
  static clearService(providerId: string): void {
    this.instances.delete(providerId);
    this.log.info('清理 WebViewService 实例', 'WebViewServiceFactory', {
      providerId,
    });
  }

  /**
   * 清理所有 WebViewService 实例
   *
   * 清空所有已创建的服务实例，释放所有相关资源。
   * 主要用于扩展停用或重置时的清理工作。
   */
  static clearAll(): void {
    this.instances.clear();
    this.log.info('清理全部 WebViewService 实例', 'WebViewServiceFactory');
  }
}
