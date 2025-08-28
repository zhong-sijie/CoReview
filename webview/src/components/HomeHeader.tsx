import React, { useMemo } from "react";
import Select, { StylesConfig } from "react-select";
import {
  DEFAULT_REVIEW_FILTER_OPTION,
  REVIEW_FILTER_OPTIONS,
} from "@shared/constants";
import {
  ProjectOptionResponse,
  ProjectSelectOption,
  ReviewListFilterOption,
} from "@shared/types";

/**
 * 主页头部组件的属性接口
 *
 * 定义主页头部组件所需的所有属性，包括数据、状态和回调函数。
 * 负责项目选择、状态筛选、编辑操作等功能。
 */
interface Props {
  /** 可选的项目列表数据 */
  projects: ProjectOptionResponse[];
  /** 当前选中的值，包含项目和状态筛选 */
  value: {
    /** 当前选中的项目 */
    project?: ProjectSelectOption;
    /** 当前选中的状态筛选 */
    statusValue: ReviewListFilterOption;
  };
  /** 项目列表加载状态 */
  projectsLoading: boolean;
  /** 值变更时的回调函数 */
  onChange: (payload: {
    /** 选中的项目 */
    project?: ProjectSelectOption;
    /** 选中的状态筛选 */
    statusValue: ReviewListFilterOption;
  }) => void;
  /** 已编辑的数据条数 */
  editedCount: number;
  /** 重置编辑数据的回调函数 */
  onReset: () => void;
  /** 提交编辑数据的回调函数 */
  onSubmit: () => void;
  /** 更新上下文时的加载状态 */
  updatingContextLoading?: boolean;
  /** 提交数据时的加载状态 */
  submittingLoading?: boolean;
  /** 查询评论时的加载状态 */
  queryingCommentsLoading?: boolean;
}

/**
 * 主页头部组件
 *
 * 提供主页的头部区域，包含项目选择、状态筛选、编辑操作等功能。
 * 使用react-select组件实现下拉选择，并自定义样式以适配VS Code主题。
 *
 * 主要功能：
 * - 项目选择：支持清空选择
 * - 状态筛选：全部、我提交的、待我确认
 * - 编辑操作：显示编辑数量、提交、重置按钮
 * - 加载状态：各种操作的加载状态显示
 */
const HomeHeader = (props: Props) => {
  const {
    projects = [],
    value,
    projectsLoading,
    onChange,
    editedCount,
    onReset,
    onSubmit,
    submittingLoading,
    queryingCommentsLoading,
  } = props;

  /**
   * 转换数据格式为 react-select 需要的格式
   *
   * 将后端返回的项目数据转换为react-select组件需要的格式。
   * 使用useMemo优化性能，避免不必要的重新计算。
   */
  const options = useMemo(
    () =>
      projects.map((project) => ({
        value: project.projectId,
        label: project.projectName,
      })) || [],
    [projects]
  );

  /**
   * react-select 组件的自定义样式配置
   *
   * 使用VS Code主题变量确保下拉选择框与编辑器主题保持一致。
   * 包括控制框、菜单、选项、输入框等各个部分的样式。
   */
  const selectStyles: StylesConfig<any, false> = {
    control: (provided) => ({
      ...provided,
      backgroundColor: "var(--vscode-editor-background)",
      borderColor: "var(--vscode-border)",
      color: "var(--vscode-editor-foreground)",
      minHeight: "28px",
      height: "28px",
    }),
    menu: (provided) => ({
      ...provided,
      backgroundColor: "var(--vscode-editor-background)",
      border: "1px solid var(--vscode-border)",
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isFocused
        ? "var(--vscode-list-hoverBackground)"
        : "transparent",
      color: "var(--vscode-editor-foreground)",
      ":active": {
        backgroundColor: "var(--vscode-list-activeSelectionBackground)",
      },
    }),
    singleValue: (provided) => ({
      ...provided,
      color: "var(--vscode-editor-foreground)",
      lineHeight: "1.2",
    }),
    input: (provided) => ({
      ...provided,
      color: "var(--vscode-editor-foreground)",
      lineHeight: "1.2",
    }),
    valueContainer: (provided) => ({
      ...provided,
      padding: "2px 8px",
    }),
    indicatorsContainer: (provided) => ({
      ...provided,
      height: "28px",
    }),
  };

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-border)] bg-[var(--vscode-background)]">
      <div className="flex items-center gap-2">
        <label className="text-sm opacity-80">项目：</label>
        <Select
          isLoading={projectsLoading}
          options={options}
          value={value.project}
          styles={selectStyles}
          placeholder="选择项目"
          isClearable={true}
          className="w-48"
          onChange={(option) => {
            const next = (option as ProjectSelectOption | null) || undefined;
            onChange({ project: next, statusValue: value.statusValue });
          }}
        />
        {/* 状态筛选 */}
        <label className="text-sm opacity-80 ml-3">状态：</label>
        <Select
          options={REVIEW_FILTER_OPTIONS}
          value={value.statusValue}
          styles={selectStyles}
          placeholder="选择状态"
          isClearable={false}
          className="w-40"
          onChange={(option) =>
            onChange({
              project: value.project,
              statusValue:
                (option as ReviewListFilterOption) ??
                DEFAULT_REVIEW_FILTER_OPTION,
            })
          }
        />
      </div>
      {!!editedCount && (
        <div className="flex items-center gap-3">
          <span className="text-sm opacity-80">
            已编辑：
            <span className="ml-1 font-semibold">{editedCount}</span>
          </span>
          <button
            className="text-xs px-3 py-1 rounded border border-[var(--vscode-border)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors disabled:opacity-60"
            onClick={onSubmit}
            disabled={!!submittingLoading || !!queryingCommentsLoading}
          >
            {submittingLoading ? "提交中..." : "提交"}
          </button>
          <button
            className="text-xs px-3 py-1 rounded border border-[var(--vscode-border)] hover:bg-[var(--vscode-list-hoverBackground)] active:bg-[var(--vscode-list-activeSelectionBackground)] transition-colors disabled:opacity-60"
            onClick={onReset}
            disabled={queryingCommentsLoading}
          >
            重置
          </button>
        </div>
      )}
    </header>
  );
};

export default HomeHeader;
