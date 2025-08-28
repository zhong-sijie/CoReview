import { EnumReviewListFilter } from "./enums";
import type { ReviewListFilterOption } from "./types";

/**
 * 跨端共享常量定义文件
 *
 * 该文件定义了在整个VS Code扩展和WebView之间共享的常量值。
 * 所有常量使用全大写下划线命名规范，确保跨端一致性。
 *
 * 主要包含：
 * - 代码评审列表筛选选项
 * - 默认筛选设置
 * - 其他跨端共享的配置常量
 */

/**
 * 代码评审列表头部状态筛选固定选项
 *
 * 定义了用户在代码评审列表页面可以选择的筛选条件。
 * 这些选项会显示在列表顶部的筛选器中，用户可以通过点击来切换不同的视图。
 *
 * 筛选选项包括：
 * - 全部：显示所有代码评审记录
 * - 我提交的：只显示当前用户提交的评审
 * - 待我确认：只显示需要当前用户确认的评审
 */
export const REVIEW_FILTER_OPTIONS: ReviewListFilterOption[] = [
  /** 全部评审记录筛选选项 */
  { value: EnumReviewListFilter.All, label: "全部" },
  /** 当前用户提交的评审筛选选项 */
  { value: EnumReviewListFilter.Mine, label: "我提交的" },
  /** 需要当前用户确认的评审筛选选项 */
  { value: EnumReviewListFilter.ToConfirm, label: "待我确认" },
];

/**
 * 默认状态筛选选项
 *
 * 当用户首次进入代码评审列表页面时，系统会默认选择"全部"筛选条件。
 * 这个常量引用了REVIEW_FILTER_OPTIONS数组中的第一个元素。
 *
 * 用途：
 * - 初始化筛选器状态
 * - 重置筛选条件时的默认值
 * - 新用户首次访问时的默认视图
 */
export const DEFAULT_REVIEW_FILTER_OPTION: ReviewListFilterOption =
  REVIEW_FILTER_OPTIONS[0];
