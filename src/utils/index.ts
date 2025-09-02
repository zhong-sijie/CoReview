import * as vscode from 'vscode';

/**
 * 工具函数集合
 *
 * 提供VS Code扩展中常用的工具函数，包括消息提示、错误处理等。
 * 所有函数都带有"CoReview"前缀，便于识别来源。
 */

/**
 * 显示错误消息
 *
 * 在VS Code中显示错误提示，带有"CoReview"前缀标识。
 * 使用VS Code的原生错误消息框，提供良好的用户体验。
 */
export function showError(message: string): void {
  vscode.window.showErrorMessage(`CoReview: ${message}`);
}

/**
 * 显示信息消息
 *
 * 在VS Code中显示信息提示，带有"CoReview"前缀标识。
 * 使用VS Code的原生信息消息框，用于成功操作或一般信息展示。
 */
export function showInfo(message: string): void {
  vscode.window.showInformationMessage(`CoReview: ${message}`);
}

/**
 * 显示警告消息
 *
 * 在VS Code中显示警告提示，带有"CoReview"前缀标识。
 * 使用VS Code的原生警告消息框，用于需要注意但不致命的情况。
 */
export function showWarning(message: string): void {
  vscode.window.showWarningMessage(`CoReview: ${message}`);
}
