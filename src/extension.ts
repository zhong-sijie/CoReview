// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { CommandManager } from './core/CommandManager';
import { EditorialViewProvider } from './providers/EditorialViewProvider';
import { ReviewViewProvider } from './providers/ReviewViewProvider';
import { LogService } from './services/LogService';
import { ReminderService } from './services/ReminderService';
import { StateService } from './services/StateService';

/**
 * VS Code 扩展激活函数
 *
 * 当扩展被激活时调用此函数，负责初始化扩展的核心组件。
 * 这是扩展的入口点，所有初始化工作都在这里完成。
 *
 * 执行流程：
 * 1. 获取命令管理器和状态服务的单例实例
 * 2. 初始化状态管理服务，从持久化存储恢复状态
 * 3. 创建并注册视图提供者，建立WebView界面
 * 4. 将视图提供者设置到命令管理器，建立通信桥梁
 * 5. 注册所有VS Code命令，完成扩展初始化
 *
 * @param context VS Code 扩展上下文，提供扩展生命周期管理能力
 */
export function activate(context: vscode.ExtensionContext) {
  /** 日志服务实例，负责记录扩展运行日志 */
  const log = LogService.getInstance();

  // 扩展激活开始
  log.info('扩展激活开始', 'extension');

  // 记录关键版本信息（用于定位用户版本问题）
  try {
    const ext = (vscode as any).extensions.getExtension(
      (context as any).extension.id,
    );
    const pkg = ext?.packageJSON ?? {};
    const meta = {
      id: ext?.id,
      name: pkg.displayName || pkg.name,
      version: pkg.version,
      vscodeVersion: vscode.version,
    } as Record<string, unknown>;
    log.info('扩展元信息', 'extension', meta);
  } catch (e) {
    log.warn('记录扩展元信息失败', 'extension', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  /** 命令管理器实例，负责处理所有VS Code命令 */
  const commandManager = CommandManager.getInstance();
  /** 状态服务实例，负责管理应用状态和持久化 */
  const stateService = StateService.getInstance();

  // 初始化状态管理服务
  stateService.initialize(context);

  // 注册主视图提供者
  /** 主视图提供者实例，负责创建和管理WebView界面 */
  const viewProvider = new ReviewViewProvider(context.extensionUri);
  log.info('注册主视图提供者', 'extension', {
    viewType: ReviewViewProvider.viewType,
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ReviewViewProvider.viewType,
      viewProvider,
    ),
  );

  // 注册编辑视图提供者
  /** 编辑视图提供者实例，负责管理评审意见面板 */
  const editorialProvider = new EditorialViewProvider(
    context.extensionUri,
    () => {
      // 当有新的评审意见被添加时，通知主视图刷新数据
      if (viewProvider) {
        log.info('检测到新增评审意见，触发主视图刷新', 'extension');
        viewProvider.broadcastNewReviewComment();
      }
    },
  );
  log.info('注册编辑视图提供者', 'extension', {
    viewType: EditorialViewProvider.viewType,
  });
  // 设置视图提供者到命令管理器
  commandManager.setViewProvider(viewProvider);
  commandManager.setEditorialProvider(editorialProvider);

  log.info('配置命令管理器完成', 'extension');

  // 注册命令
  log.info('开始注册 VS Code 命令', 'extension');
  commandManager.registerCommands(context);

  // 启动每日提醒服务
  ReminderService.getInstance().start(context);
}
