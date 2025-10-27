import { postMessage } from '@common/services/vscodeService';
import { EnumMessageType } from '@shared/enums';
import type { ReviewCommentItem, ReviewCommentValues } from '@shared/types';
import type { ColumnConfig } from '@shared/types';
import EditableField from './EditableField';

/**
 * 卡片视图组件的属性接口
 *
 * 定义卡片视图组件所需的所有属性，包括表格配置、数据和状态。
 * 负责以卡片形式渲染评审评论数据，支持编辑功能。
 */
interface Props {
  /** 列配置，定义卡片的字段结构和渲染方式 */
  columns: ColumnConfig[];
  /** 数据源，包含所有评审评论数据 */
  dataSource: ReviewCommentItem[];
  /** 表格加载状态，控制加载提示的显示 */
  loading?: boolean;
  /** 当前编辑的单元格状态 */
  editingCell?: {
    rowId: string;
    columnId: string;
  };
  /** 开始编辑单元格的回调函数 */
  onStartEdit: (rowId: string, columnId: string) => void;
  /** 停止编辑单元格的回调函数 */
  onStopEdit: () => void;
  /** 更新数据的回调函数 */
  onUpdate: (value: string, row: ReviewCommentItem, col: ColumnConfig) => void;
}

/**
 * 卡片视图组件
 *
 * 以卡片形式渲染评审评论数据，每个卡片代表一条记录。
 * 支持编辑功能，与表格视图保持一致的交互体验。
 *
 * 主要功能：
 * - 卡片布局：以卡片形式展示数据，更直观易读
 * - 字段编辑：支持点击字段进行编辑，与表格编辑逻辑一致
 * - 双击跳转：支持双击卡片跳转到对应文件和行号
 * - 响应式设计：自适应不同屏幕尺寸
 * - 主题适配：使用VS Code主题变量
 */
const CardView = (props: Props) => {
  const {
    columns,
    dataSource,
    loading,
    editingCell,
    onStartEdit,
    onStopEdit,
    onUpdate,
  } = props;

  /**
   * 处理双击卡片事件
   *
   * 当用户双击卡片时，提取文件路径和行号信息，并发送到扩展端进行文件跳转。
   * 支持多段行号范围，如 "4 ~ 8; 10 ~ 20; 30 ~ 50"。
   *
   * @param row 被双击的行数据
   */
  const handleCardDoubleClick = (row: ReviewCommentItem) => {
    const { values } = row;
    const filePath = values.filePath?.value;
    const lineRange = values.lineRange?.value;

    // 检查是否有文件路径和行号信息
    if (!filePath || !lineRange) {
      return;
    }

    // 发送文件跳转消息到扩展端
    postMessage(EnumMessageType.OpenFile, { filePath, lineRange });
  };

  /**
   * 渲染加载状态
   *
   * 当loading为true时显示加载提示
   */
  if (loading) {
    return (
      <div className="grid h-[200px] place-items-center gap-4 text-center">
        <p className="m-0 opacity-70">加载中...</p>
      </div>
    );
  }

  /**
   * 渲染空数据状态
   *
   * 当数据源为空时显示友好提示
   */
  if (!dataSource.length) {
    return (
      <div className="grid h-[200px] place-items-center gap-4 text-center">
        <p className="m-0 opacity-70">暂无代码审查数据</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2 p-2">
      {dataSource.map(row => (
        <div
          key={row.id}
          className="cursor-pointer rounded-md border border-solid border-[var(--vscode-descriptionForeground)] bg-transparent p-2 transition-all hover:border-transparent hover:bg-[var(--vscode-list-hoverBackground)]"
          onDoubleClick={() => handleCardDoubleClick(row)}
          title="双击跳转到对应文件和行号">
          {/* 卡片内容 - 字段网格布局 */}
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {columns
              .filter(col => col.showInIdeaTable)
              .sort((a, b) => a.sortIndex - b.sortIndex)
              .map(column => {
                const columnId = column.columnCode;
                const isEditing =
                  editingCell?.rowId === row.id &&
                  editingCell?.columnId === columnId;

                // 获取字段值，使用与表格相同的逻辑
                const fv = row.values?.[
                  column.columnCode as keyof ReviewCommentValues
                ] as any;
                const title = (fv?.showName ?? fv?.value) as
                  | string
                  | number
                  | undefined;

                return (
                  <div key={columnId} className="flex min-w-0 flex-col">
                    {/* 字段标签 */}
                    <label className="mb-0 text-xs font-medium text-[var(--vscode-descriptionForeground)]">
                      {column.showName}
                    </label>

                    {/* 字段值 - 使用与表格相同的 EditableField 组件 */}
                    <div className="min-h-[24px]">
                      <EditableField
                        title={title || ''}
                        col={column}
                        row={row}
                        isEditing={isEditing}
                        layout="card"
                        onStartEdit={() => onStartEdit(row.id, columnId)}
                        onStopEdit={onStopEdit}
                        onUpdate={onUpdate}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CardView;
