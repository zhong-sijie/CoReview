// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { CommandManager } from './core/CommandManager';
import { EditorialViewProvider } from './providers/EditorialViewProvider';
import { ReviewViewProvider } from './providers/ReviewViewProvider';
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
  /** 命令管理器实例，负责处理所有VS Code命令 */
  const commandManager = CommandManager.getInstance();
  /** 状态服务实例，负责管理应用状态和持久化 */
  const stateService = StateService.getInstance();

  // 初始化状态管理服务
  stateService.initialize(context);

  // 注册主视图提供者
  /** 主视图提供者实例，负责创建和管理WebView界面 */
  const viewProvider = new ReviewViewProvider(context.extensionUri);
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
        viewProvider.broadcastNewReviewComment();
      }
    },
  );

  // 设置视图提供者到命令管理器
  commandManager.setViewProvider(viewProvider);
  commandManager.setEditorialProvider(editorialProvider);

  // 注册命令
  commandManager.registerCommands(context);
}
