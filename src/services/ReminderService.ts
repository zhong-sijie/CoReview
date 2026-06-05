import dayjs from 'dayjs';
import * as vscode from 'vscode';
import { LogService } from './LogService';
import { StateService } from './StateService';
import { TableService } from './TableService';

/**
 * 每日提醒服务（ReminderService）
 *
 * 职责与行为：
 * - 在本地时间每天 11:00 推送一次“待处理评审数量”的提醒。
 * - 若用户在 11:00 之前首次使用扩展（已登录且连通），则当天会立即提醒一次；当日不重复提醒。
 * - 提醒前置条件：必须满足（已登录 && 连接就绪 && 已配置 serverUrl）。
 *
 * 设计要点：
 * - 去重策略：通过 `StateService.LAST_REMINDER_DATE` 以 YYYY-MM-DD 持久化今日已提醒的日期。
 * - 调度策略：使用一次性 `setTimeout` 距离下一次 11:00 的毫秒数进行调度；每次触发后重新计算下一次的延迟。
 * - 统计策略：调用 `TableService.loadPendingCount()`（筛选“待我确认”）获取待处理数量。
 * - 生命周期：在扩展 `activate` 中 `start()`，并在扩展销毁时自动 `stop()` 清理定时器。
 *
 * 边界情况：
 * - 未登录/未连通/未配置 serverUrl：不会提醒，也不会更新最后提醒日期。
 * - 切换时区或系统时间：下一次 11:00 的计算基于当前本地时间；已提醒的日期以本地日期持久化。
 * - 当天多次打开 VSCode：仅第一次满足条件时提醒一次，后续不再重复。
 */
export class ReminderService {
  private static instance: ReminderService;

  private log: LogService = LogService.getInstance();
  private stateService: StateService = StateService.getInstance();
  private tableService: TableService = TableService.getInstance();

  /**
   * 当前调度的定时器句柄。
   * 使用一次性 setTimeout 避免长期 setInterval 漂移问题。
   */
  private scheduledTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {}

  public static getInstance(): ReminderService {
    if (!ReminderService.instance) {
      ReminderService.instance = new ReminderService();
    }
    return ReminderService.instance;
  }

  /**
   * 启动提醒服务（在扩展激活时调用）
   *
   * 流程：
   * 1) 先尝试执行“当天首次提醒”（满足条件且未提醒过则触发）。
   * 2) 根据当前时间计算到下一次本地 11:00 的延迟，安排一次性定时器。
   * 3) 将 stop() 绑定到扩展的销毁流程以清理定时器。
   */
  public start(context: vscode.ExtensionContext): void {
    // 当天首次尝试“每日提醒”（满足条件且未提醒过则触发，不包含登录触发）
    void this.maybeNotifyDaily();

    // 安排每天 11:00 的提醒
    const delay = this.msUntilNext11AM();
    this.scheduledTimer = setTimeout(this.tick, delay);

    // 卸载清理
    context.subscriptions.push({
      dispose: () => this.stop(),
    });
  }

  /**
   * 停止提醒服务并清理定时器
   *
   * 在扩展卸载或需要临时停用提醒服务时调用。
   */
  public stop(): void {
    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = null;
    }
  }

  /**
   * 定时触发函数：提醒后继续安排下一次
   *
   * 说明：
   * - 使用箭头函数以绑定当前实例 this。
   * - 每次触发后重新计算下一次到 11:00 的延迟，避免固定间隔导致累积偏移。
   */
  private tick = () => {
    void this.maybeNotifyDaily();
    // 继续安排下一次 11:00
    const delay = this.msUntilNext11AM();
    this.scheduledTimer = setTimeout(this.tick, delay);
  };

  /**
   * 计算距离下一次 11:00 的毫秒数（本地时区）
   *
   * 若当前时间已过今日 11:00，则返回距离“明天 11:00”的毫秒数。
   */
  private msUntilNext11AM(): number {
    const now = dayjs();
    let next = now.hour(11).minute(0).second(0).millisecond(0);
    if (next.valueOf() <= now.valueOf()) {
      next = next.add(1, 'day');
    }
    return next.diff(now, 'millisecond');
  }

  /**
   * 将日期格式化为 YYYY-MM-DD（本地时区）
   */
  private getLocalDateStr(d?: Date | string | number): string {
    return dayjs(d).format('YYYY-MM-DD');
  }

  private canNotify(): boolean {
    const app = this.stateService.getState();
    return (
      app.loggedIn &&
      app.connectionOk &&
      Boolean(this.stateService.getServerUrl())
    );
  }

  private async showPendingNotification(): Promise<void> {
    const count = await this.tableService.loadPendingCount();
    if (count > 0) {
      vscode.window.showInformationMessage(`你有 ${count} 条评审待处理`);
    } else {
      vscode.window.showInformationMessage(
        '待处理清零，太棒啦🎉 继续保持优秀！💪',
      );
    }
  }

  private async maybeNotifyDaily(): Promise<void> {
    try {
      if (!this.canNotify()) {
        return;
      }

      const today = this.getLocalDateStr();
      const lastDaily = this.stateService.getLastDailyReminderDate();
      if (lastDaily === today) {
        return;
      }

      await this.showPendingNotification();
      await this.stateService.setLastDailyReminderDate(today);
    } catch (e) {
      this.log.warn('每日提醒执行失败', 'ReminderService', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  public async notifyOnLogin(): Promise<void> {
    try {
      if (!this.canNotify()) {
        return;
      }

      await this.showPendingNotification();

      const today = this.getLocalDateStr();
      await this.stateService.setLastDailyReminderDate(today);
    } catch (e) {
      this.log.warn('登录提醒执行失败', 'ReminderService', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
