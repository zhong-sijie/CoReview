/**
 * 跨端共享工具函数集合
 *
 * 提供在扩展端和 Webview 中都可以使用的通用工具函数。
 * 主要包含 ID 生成、时间戳转换等核心功能。
 */

/** 生成唯一 ID（Webview 回调等场景） */
export const createUniqueId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

/**
 * 获取对象键数量
 * @param obj 要计算键数量的对象
 * @returns 键的数量，如果对象为空或null则返回0
 */
export function getObjectKeyCount(
  obj: Record<string, any> | null | undefined,
): number {
  return obj ? Object.keys(obj).length : 0;
}

/**
 * 获取数组长度
 * @param arr 要计算长度的数组
 * @returns 数组长度，如果数组为空或null则返回0
 */
export function getArrayLength(arr: any[] | null | undefined): number {
  return arr ? arr.length : 0;
}

/**
 * 标准化文件路径，统一使用正斜杠格式
 *
 * 将所有路径统一转换为正斜杠格式，因为 Windows 和 Unix 系统都支持正斜杠。
 * 这样简化了跨平台路径处理，提供一致的路径格式。
 *
 * @param filePath 原始文件路径
 * @returns 标准化后的文件路径（使用正斜杠）
 */
export function normalizeFilePath(filePath: string): string {
  if (!filePath) {
    return filePath;
  }

  // 将所有反斜杠替换为正斜杠，统一路径格式
  return filePath.replace(/\\/g, '/');
}

/**
 * 将文件路径转换为工作区相对路径
 *
 * 如果文件路径在工作区根目录下，则返回相对路径；
 * 否则返回原始绝对路径。
 * 统一使用正斜杠格式。
 *
 * @param filePath 文件路径
 * @param workspaceRoot 工作区根目录路径
 * @returns 相对路径或原始绝对路径
 */
export function toWorkspaceRelativePath(
  filePath: string,
  workspaceRoot: string,
): string {
  if (!filePath || !workspaceRoot) {
    return filePath;
  }

  // 标准化路径，统一使用正斜杠
  const normalizedFilePath = normalizeFilePath(filePath);
  const normalizedWorkspaceRoot = normalizeFilePath(workspaceRoot);

  // 检查文件路径是否在工作区根目录下
  if (normalizedFilePath.startsWith(normalizedWorkspaceRoot)) {
    let relativePath = normalizedFilePath.substring(
      normalizedWorkspaceRoot.length,
    );

    // 移除开头的正斜杠
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.substring(1);
    }

    return relativePath;
  }

  return normalizedFilePath;
}
