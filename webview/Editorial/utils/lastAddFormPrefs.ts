/**
 * Editorial 添加表单偏好工具
 *
 * 持久化由扩展端 StateService 负责；此处仅做字段抽取与恢复合并。
 */
export {
  applyLastAddFormPrefs,
  extractLastAddFormPrefs,
  NEVER_CACHE_COLUMN_CODES,
} from '@shared/lastAddFormPrefs';
