import { useMemo } from 'react';
import Select, { type StylesConfig } from 'react-select';
import { REVIEW_FILTER_OPTIONS } from '@shared/constants';
import type {
  ProjectOptionResponse,
  ProjectSelectOption,
  ReviewListFilterOption,
} from '@shared/types';

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
    statusValue?: ReviewListFilterOption;
  };
  /** 项目列表加载状态 */
  projectsLoading: boolean;
  /** 值变更时的回调函数 */
  onChange: (payload: {
    /** 选中的项目 */
    project?: ProjectSelectOption;
    /** 选中的状态筛选 */
    statusValue?: ReviewListFilterOption;
  }) => void;
  /** 已编辑的数据条数 */
  editedCount: number;
  /** 新增的数据条数 */
  addedCount: number;
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
    addedCount,
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
      projects.map(project => ({
        value: project.projectId,
        label: project.projectName,
      })) || [],
    [projects],
  );

  /**
   * react-select 组件的自定义样式配置
   *
   * 使用VS Code主题变量确保下拉选择框与编辑器主题保持一致。
   * 包括控制框、菜单、选项、输入框等各个部分的样式。
   */
  const selectStyles: StylesConfig<any, false> = {
    control: provided => ({
      ...provided,
      backgroundColor: 'var(--vscode-editor-background)',
      borderColor: 'var(--vscode-panel-border)',
      color: 'var(--vscode-editor-foreground)',
      minHeight: '28px',
      height: '28px',
    }),
    menu: provided => ({
      ...provided,
      backgroundColor: 'var(--vscode-editor-background)',
      border: '1px solid var(--vscode-panel-border)',
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isFocused
        ? 'var(--vscode-list-hoverBackground)'
        : 'transparent',
      color: 'var(--vscode-editor-foreground)',
      ':active': {
        backgroundColor: 'var(--vscode-list-activeSelectionBackground)',
      },
    }),
    singleValue: provided => ({
      ...provided,
      color: 'var(--vscode-editor-foreground)',
      lineHeight: '1.2',
    }),
    input: provided => ({
      ...provided,
      color: 'var(--vscode-editor-foreground)',
      lineHeight: '1.2',
    }),
    valueContainer: provided => ({
      ...provided,
      padding: '2px 8px',
    }),
    indicatorsContainer: provided => ({
      ...provided,
      height: '28px',
    }),
  };

  return (
    <header className="flex flex-col gap-3 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] px-4 py-3">
      {/* 第一行：项目和操作 */}
      <div className="flex items-center justify-between">
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
            onChange={option => {
              const next = (option as ProjectSelectOption | null) || undefined;
              onChange({ project: next, statusValue: value.statusValue });
            }}
          />
        </div>
        {(!!editedCount || !!addedCount) && (
          <div className="flex items-center gap-4">
            {/* 编辑统计信息组 */}
            <div className="flex items-center gap-2 rounded-md px-3 py-1.5">
              {!!editedCount && (
                <span className="flex items-center gap-1 text-xs">
                  <span className="bg-orange-4/60 h-2 w-2 rounded-full"></span>
                  已编辑:{' '}
                  <span className="text-orange-7 font-semibold">
                    {editedCount}
                  </span>
                </span>
              )}
              {!!editedCount && !!addedCount && (
                <span className="text-xs opacity-60">|</span>
              )}
              {!!addedCount && (
                <span className="flex items-center gap-1 text-xs">
                  <span className="bg-green-6/60 h-2 w-2 rounded-full"></span>
                  新增:{' '}
                  <span className="text-green-7 font-semibold">
                    {addedCount}
                  </span>
                </span>
              )}
            </div>

            {/* 操作按钮组 */}
            <div className="flex items-center gap-2">
              <button
                className="bg-grey-13 text-grey-5 hover:bg-grey-12 active:bg-grey-11 flex items-center gap-1.5 rounded-md border border-[var(--vscode-panel-border)] px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60"
                onClick={onReset}
                disabled={queryingCommentsLoading}>
                <span>↺</span>
                重置
              </button>
              <button
                className="bg-blue-6/20 text-blue-9 hover:bg-blue-6/30 flex items-center gap-1.5 rounded-md border border-[var(--vscode-panel-border)] px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60"
                onClick={onSubmit}
                disabled={!!submittingLoading || !!queryingCommentsLoading}>
                {submittingLoading ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"></span>
                    提交中...
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    提交
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
      {/* 第二行：状态筛选 */}
      <div className="flex items-center gap-2">
        <label className="text-sm opacity-80">状态：</label>
        <Select
          options={REVIEW_FILTER_OPTIONS}
          value={value.statusValue}
          styles={selectStyles}
          placeholder="选择状态"
          isClearable
          className="w-48"
          onChange={option =>
            onChange({
              project: value.project,
              statusValue: option,
            })
          }
        />
      </div>
    </header>
  );
};

export default HomeHeader;
