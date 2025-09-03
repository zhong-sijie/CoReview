import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as winston from 'winston';
import { EnumLogLevel } from '../../shared/enums';

/**
 * 日志事件接口
 */
export interface LogEvent {
  timestamp: string;
  level: EnumLogLevel;
  message: string;
  context?: string;
  data?: any;
  userId?: string;
  sessionId?: string;
}

/**
 * 日志服务类
 *
 * 功能特性：
 * 1. 使用 winston 作为底层日志库
 * 2. 支持 JSONL 格式输出（每行一个完整的 JSON 记录）
 * 3. 按日期命名日志文件（YYYY-MM-DD.jsonl）
 * 4. 自动清理超过3天的旧日志文件
 * 5. 支持不同日志级别
 * 6. 支持结构化日志数据
 */
export class LogService {
  private static instance: LogService;
  private logger!: winston.Logger;
  private logDir: string;
  private currentDate: string;

  private constructor() {
    this.currentDate = this.getCurrentDate();
    this.logDir = this.getLogDirectory();
    this.ensureLogDirectory();
    this.cleanupOldLogFiles();
    this.initializeLogger();
  }

  /**
   * 获取日志服务单例实例
   */
  public static getInstance(): LogService {
    if (!LogService.instance) {
      LogService.instance = new LogService();
    }
    return LogService.instance;
  }

  /**
   * 获取当前日期字符串 (YYYY-MM-DD)
   */
  private getCurrentDate(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * 获取日志目录路径
   */
  private getLogDirectory(): string {
    // 在 VS Code 扩展的全局存储目录下创建 logs 文件夹
    try {
      const extension = vscode.extensions.getExtension('zhongsijie.CoReview');
      if (extension) {
        // 使用 context.globalStorageUri 来获取存储路径
        // 这里我们暂时使用临时目录，在 extension.ts 中会传入正确的路径
        return path.join(os.tmpdir(), 'coreview', 'logs');
      }
    } catch {
      // ignore
    }

    // 如果无法获取扩展存储路径，则使用临时目录
    return path.join(os.tmpdir(), 'coreview', 'logs');
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 清理超过3天的旧日志文件
   */
  private cleanupOldLogFiles(): void {
    try {
      const files = fs.readdirSync(this.logDir);
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      files.forEach(file => {
        if (file.endsWith('.jsonl')) {
          const filePath = path.join(this.logDir, file);
          const stats = fs.statSync(filePath);

          if (stats.mtime < threeDaysAgo) {
            fs.unlinkSync(filePath);
          }
        }
      });
    } catch {
      // ignore
    }
  }

  /**
   * 初始化 winston 日志器
   *
   * 固定配置：
   * - 日志级别：info
   * - 输出：仅文件，无控制台输出
   * - 格式：JSONL，每行一个完整的 JSON 记录
   */
  private initializeLogger(): void {
    const logFilePath = path.join(this.logDir, `${this.currentDate}.jsonl`);

    // 创建自定义格式，确保每行都是完整的 JSON
    const jsonlFormat = winston.format.printf(
      ({ timestamp, level, message, context, data, userId, sessionId }) => {
        const logEvent: LogEvent = {
          timestamp: timestamp as string,
          level: level as EnumLogLevel,
          message: message as string,
          ...(context ? { context: context as string } : {}),
          ...(data ? { data } : {}),
          ...(userId ? { userId: userId as string } : {}),
          ...(sessionId ? { sessionId: sessionId as string } : {}),
        };
        return JSON.stringify(logEvent);
      },
    );

    const transports: winston.transport[] = [
      new winston.transports.File({
        filename: logFilePath,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 1, // 每天只保留一个文件
      }),
    ];

    this.logger = winston.createLogger({
      level: EnumLogLevel.INFO,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        jsonlFormat,
      ),
      transports,
    });
  }

  /**
   * 检查是否需要切换到新的日期文件
   */
  private checkDateChange(): void {
    const currentDate = this.getCurrentDate();
    if (currentDate !== this.currentDate) {
      this.currentDate = currentDate;
      this.cleanupOldLogFiles();
      this.initializeLogger();
    }
  }

  /**
   * 记录错误日志
   */
  public error(
    message: string,
    context?: string,
    data?: any,
    userId?: string,
    sessionId?: string,
  ): void {
    this.checkDateChange();
    this.logger.error(message, { context, data, userId, sessionId });
  }

  /**
   * 记录警告日志
   */
  public warn(
    message: string,
    context?: string,
    data?: any,
    userId?: string,
    sessionId?: string,
  ): void {
    this.checkDateChange();
    this.logger.warn(message, { context, data, userId, sessionId });
  }

  /**
   * 记录信息日志
   */
  public info(
    message: string,
    context?: string,
    data?: any,
    userId?: string,
    sessionId?: string,
  ): void {
    this.checkDateChange();
    this.logger.info(message, { context, data, userId, sessionId });
  }

  /**
   * 记录调试日志
   */
  public debug(
    message: string,
    context?: string,
    data?: any,
    userId?: string,
    sessionId?: string,
  ): void {
    this.checkDateChange();
    this.logger.debug(message, { context, data, userId, sessionId });
  }

  /**
   * 记录结构化日志事件
   */
  public logEvent(event: LogEvent): void {
    this.checkDateChange();
    this.logger.log(event.level, event.message, {
      context: event.context,
      data: event.data,
      userId: event.userId,
      sessionId: event.sessionId,
    });
  }

  /**
   * 获取日志文件路径
   */
  public getLogFilePath(): string {
    return path.join(this.logDir, `${this.currentDate}.jsonl`);
  }

  /**
   * 获取日志目录路径
   */
  public getLogDirectoryPath(): string {
    return this.logDir;
  }

  /**
   * 手动清理旧日志文件
   */
  public cleanupOldLogs(): void {
    this.cleanupOldLogFiles();
  }

  /**
   * 关闭日志服务
   */
  public close(): void {
    if (this.logger) {
      this.logger.close();
    }
  }
}
