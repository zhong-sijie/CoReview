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

  /**
   * 若满足条件且今日尚未提醒，则计算数量并提醒一次
   *
   * 条件：
   * - 已登录：由 `StateService` 的应用状态决定
   * - 连接就绪：确保可访问接口
   * - 已配置 serverUrl：确保请求基础地址有效
   * - 未在当日提醒过：通过 `LAST_REMINDER_DATE` 去重
   *
   * 逻辑：
   * 1) 校验条件，任一不满足则直接返回。
   * 2) 统计“待我确认”的数量（`TableService.loadPendingCount()`）。
   * 3) 通过 VS Code 信息提示展示数量。
   * 4) 写入当日为已提醒，防止重复触发。
   */
  /**
   * 每日提醒（初始化/11点）：当天最多一次。
   * 若当天登录提醒已触发，则不再重复。
   */
  private async maybeNotifyDaily(): Promise<void> {
    try {
      const app = this.stateService.getState();
      this.log.info('开始触发每日提醒', 'ReminderService', {
        loggedIn: app.loggedIn,
        connectionOk: app.connectionOk,
        serverUrl: this.stateService.getServerUrl(),
      });
      if (!app.loggedIn) {
        this.log.info('跳过每日提醒：未满足前置条件', 'ReminderService', {
          loggedIn: app.loggedIn,
          connectionOk: app.connectionOk,
          hasServerUrl: Boolean(this.stateService.getServerUrl()),
        });
        return;
      }

      const today = this.getLocalDateStr();
      const lastDaily = this.stateService.getLastDailyReminderDate();
      if (lastDaily === today) {
        this.log.info('跳过每日提醒：今日已提醒过', 'ReminderService', {
          lastDaily,
          today,
        });
        return; // 今日已提醒
      }

      const count = await this.tableService.loadPendingCount();
      if (count > 0) {
        vscode.window.showInformationMessage(`你有 ${count} 条评审待处理`);
      } else {
        vscode.window.showInformationMessage(
          '待处理清零，太棒啦🎉 继续保持优秀！💪',
        );
      }
      await this.stateService.setLastDailyReminderDate(today);
    } catch (e) {
      this.log.warn('每日提醒执行失败', 'ReminderService', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * 登录成功时触发的提醒：允许当日多次触发（根据你的第2条，允许多次），
   * 但会重置“每日提醒”的日期，使当日 11 点/初始化的每日提醒不再出现。
   */
  public async notifyOnLogin(): Promise<void> {
    try {
      this.log.info('开始触发提醒', 'ReminderService');
      const app = this.stateService.getState();
      if (
        !app.loggedIn ||
        !app.connectionOk ||
        !this.stateService.getServerUrl()
      ) {
        return;
      }

      const count = await this.tableService.loadPendingCount();
      if (count > 0) {
        vscode.window.showInformationMessage(`你有 ${count} 条评审待处理`);
      } else {
        vscode.window.showInformationMessage(
          '待处理清零，太棒啦🎉 继续保持优秀！💪',
        );
      }

      // 登录提醒也更新“每日提醒日期”，避免当日每日提醒重复
      const today = this.getLocalDateStr();
      await this.stateService.setLastDailyReminderDate(today);
      this.log.info('登录提醒完成并记录当日(合并状态)', 'ReminderService', {
        today,
      });
    } catch (e) {
      this.log.warn('登录提醒执行失败', 'ReminderService', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
