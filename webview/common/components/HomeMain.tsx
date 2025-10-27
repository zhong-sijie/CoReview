import { useCallback } from 'react';
import type { ReviewCommentItem } from '@shared/types';
import type { ColumnConfig } from '@shared/types';
import CardView from './CardView';
import TableView from './TableView';

/**
 * 主页主体组件的属性接口
 *
 * 定义主页主体组件所需的所有属性，包括表格配置、数据和状态。
 * 负责渲染评审评论的数据，支持多种布局方式。
 */
interface Props {
  /** 列配置，定义表格的列结构和渲染方式 */
  columns: ColumnConfig[];
  /** 数据源，包含所有评审评论数据 */
  dataSource: ReviewCommentItem[];
  /** 表格加载状态，控制加载提示的显示 */
  loading?: boolean;
  /** 当前布局类型 */
  layout: 'table' | 'card';
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
 * 主页主体组件
 *
 * 作为数据容器和布局管理器，负责将数据传递给具体的视图组件。
 * 支持多种布局方式，包括表格视图和卡片视图。
 *
 * 主要功能：
 * - 数据传递：将表格配置和数据传递给视图组件
 * - 布局管理：根据布局类型渲染不同的视图组件
 * - 编辑状态管理：统一管理编辑状态和回调函数
 * - 扩展性：支持后续添加其他布局方式
 */
const HomeMain = (props: Props) => {
  const {
    columns,
    dataSource,
    loading,
    layout,
    editingCell,
    onStartEdit,
    onStopEdit,
    onUpdate,
  } = props;

  /**
   * 渲染视图组件
   *
   * 根据布局类型渲染对应的视图组件
   */
  const renderView = useCallback(() => {
    const commonProps = {
      columns,
      dataSource,
      loading,
    };

    switch (layout) {
      case 'card':
        return (
          <CardView
            {...commonProps}
            editingCell={editingCell}
            onStartEdit={onStartEdit}
            onStopEdit={onStopEdit}
            onUpdate={onUpdate}
          />
        );
      case 'table':
      default:
        return (
          <TableView
            {...commonProps}
            editingCell={editingCell}
            onStartEdit={onStartEdit}
            onStopEdit={onStopEdit}
            onUpdate={onUpdate}
          />
        );
    }
  }, [
    layout,
    columns,
    dataSource,
    loading,
    editingCell,
    onStartEdit,
    onStopEdit,
    onUpdate,
  ]);

  return <main className="flex-1 overflow-auto">{renderView()}</main>;
};

export default HomeMain;
