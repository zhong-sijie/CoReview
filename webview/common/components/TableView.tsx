import { useCallback, useMemo } from 'react';
import { Column, useRowSelect, useSortBy, useTable } from 'react-table';
import { postMessage } from '@common/services/vscodeService';
import { EnumMessageType } from '@shared/enums';
import type { ReviewCommentItem, ReviewCommentValues } from '@shared/types';
import type { ColumnConfig } from '@shared/types';
import EditableField from './EditableField';

/**
 * 表格视图组件的属性接口
 *
 * 定义表格视图组件所需的所有属性，包括表格配置、数据和状态。
 * 负责渲染评审评论的数据表格，支持排序、选择等功能。
 */
/**
 * accessor 返回值类型定义
 *
 * 用于表格列的数据访问器，返回单元格渲染所需的所有信息。
 * 包含显示文本、列配置和行数据，用于EditableField组件的渲染。
 */
interface AccessorReturnValue {
  /** 显示的标题文本 */
  title: string | number | null | undefined;
  /** 列配置信息 */
  col: ColumnConfig;
  /** 行数据 */
  row: ReviewCommentItem;
}

interface Props {
  /** 列配置，定义表格的列结构和渲染方式 */
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
 * 表格视图组件
 *
 * 使用react-table库渲染评审评论的数据表格，支持排序、选择等功能。
 * 提供加载状态和空数据状态的友好提示。
 *
 * 主要功能：
 * - 数据表格渲染：使用react-table实现高性能表格
 * - 排序功能：支持点击表头进行排序
 * - 行选择：支持行选择功能（通过useRowSelect）
 * - 双击跳转：支持双击行跳转到对应文件和行号
 * - 响应式设计：支持水平滚动
 * - 主题适配：使用VS Code主题变量
 */
const TableView = (props: Props) => {
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
   * 获取单元格显示文本
   *
   * 优先使用 showName，其次使用 value。
   * 用于表格单元格的显示和排序。
   */
  const getCellTitle = useCallback(
    (row: ReviewCommentItem, col: ColumnConfig) => {
      const fv = row.values?.[
        col.columnCode as keyof ReviewCommentValues
      ] as any;
      return (fv?.showName ?? fv?.value) as string | number | undefined;
    },
    [],
  );

  /**
   * 通用比较器
   *
   * 数字优先，其次字符串，用于表格排序。
   */
  const compareByTitle = useCallback((a: unknown, b: unknown) => {
    const av = a === null || a === undefined ? '' : (a as any);
    const bv = b === null || b === undefined ? '' : (b as any);
    const an = typeof av === 'number' ? av : Number(av);
    const bn = typeof bv === 'number' ? bv : Number(bv);
    const bothNumbers = !Number.isNaN(an) && !Number.isNaN(bn);
    if (bothNumbers) {
      return an === bn ? 0 : an > bn ? 1 : -1;
    }
    const as = String(av);
    const bs = String(bv);
    return as === bs ? 0 : as > bs ? 1 : -1;
  }, []);

  /**
   * 基于 accessor 返回值中的 title 进行排序
   *
   * 用于 react-table 的排序功能。
   */
  const sortByAccessorTitle = useCallback(
    (rowA: any, rowB: any, columnId: string) => {
      const a = (rowA.values[columnId] as AccessorReturnValue | undefined)
        ?.title;
      const b = (rowB.values[columnId] as AccessorReturnValue | undefined)
        ?.title;
      return compareByTitle(a, b);
    },
    [compareByTitle],
  );

  /**
   * 将后端列配置转换为 react-table 列
   *
   * 添加自定义的单元格渲染逻辑，支持编辑功能。
   */
  const toReactTableColumn = useCallback(
    (col: ColumnConfig): Column<ReviewCommentItem> => {
      const def: any = {
        id: col.columnCode,
        Header: col.showName,
        accessor: (row: ReviewCommentItem): AccessorReturnValue => ({
          title: getCellTitle(row, col),
          col,
          row,
        }),
        Cell: (item: {
          value: AccessorReturnValue;
          row: { index: number };
        }) => {
          const { title, col, row } = item.value as AccessorReturnValue;
          const isEditing =
            editingCell?.rowId === row.id &&
            editingCell?.columnId === col.columnCode;
          return (
            <EditableField
              title={title || ''}
              col={col}
              row={row}
              isEditing={isEditing}
              layout="table"
              onStartEdit={() => onStartEdit(row.id, col.columnCode)}
              onStopEdit={onStopEdit}
              onUpdate={onUpdate}
            />
          );
        },
      };
      // 插件属性通过断言注入，避免类型不匹配
      def.sortType = sortByAccessorTitle;
      return def as unknown as Column<ReviewCommentItem>;
    },
    [
      editingCell,
      getCellTitle,
      sortByAccessorTitle,
      onStartEdit,
      onStopEdit,
      onUpdate,
    ],
  );

  /**
   * 表格列配置
   *
   * 将列配置转换为 react-table 所需的格式，并添加自定义的单元格渲染逻辑。
   * 使用 useMemo 优化性能，只在依赖项变化时重新计算。
   */
  const tableColumns = useMemo<Column<ReviewCommentItem>[]>(
    () =>
      columns
        .filter(col => col.showInIdeaTable)
        .sort((a, b) => a.sortIndex - b.sortIndex)
        .map(toReactTableColumn),
    [columns, toReactTableColumn],
  );

  /**
   * 使用react-table的hooks配置表格功能
   *
   * useTable: 核心表格功能
   * useSortBy: 排序功能
   * useRowSelect: 行选择功能
   */
  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    useTable(
      { columns: tableColumns, data: dataSource },
      useSortBy,
      useRowSelect,
    );

  /**
   * 处理双击行事件
   *
   * 当用户双击表格行时，提取文件路径和行号信息，并发送到扩展端进行文件跳转。
   * 支持多段行号范围，如 "4 ~ 8; 10 ~ 20; 30 ~ 50"。
   *
   * @param row 被双击的行数据
   */
  const handleRowDoubleClick = (row: ReviewCommentItem) => {
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
    <div className="overflow-x-auto">
      <table
        {...getTableProps()}
        className="w-full table-fixed border-collapse border border-[var(--vscode-panel-border)]">
        <thead>
          {headerGroups.map(headerGroup => (
            <tr
              {...headerGroup.getHeaderGroupProps()}
              className="bg-[var(--vscode-list-hoverBackground)]">
              {headerGroup.headers.map(column => (
                <th
                  {...column.getHeaderProps(
                    // 切换排序，仅允许单列
                    (column as any).getSortByToggleProps?.() || {},
                  )}
                  className="border-b border-r border-[var(--vscode-panel-border)] text-center text-sm font-medium text-[var(--vscode-editor-foreground)]"
                  style={{ width: `${100 / tableColumns.length}%` }}>
                  <div className="flex select-none items-center justify-center gap-1">
                    {column.render('Header')}
                    {(column as any).isSorted ? (
                      (column as any).isSortedDesc ? (
                        <span>▼</span>
                      ) : (
                        <span>▲</span>
                      )
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...getTableBodyProps()}>
          {rows.map(row => {
            prepareRow(row);
            return (
              <tr
                {...row.getRowProps()}
                className="cursor-pointer border-b border-[var(--vscode-panel-border)] transition-colors hover:bg-[var(--vscode-list-hoverBackground)]"
                onDoubleClick={() => handleRowDoubleClick(row.original)}
                title="双击跳转到对应文件和行号">
                {row.cells.map(cell => (
                  <td
                    {...cell.getCellProps()}
                    className="border-r border-[var(--vscode-panel-border)] text-sm"
                    style={{ width: `${100 / tableColumns.length}%` }}>
                    <div className="truncate" title={cell.value?.title}>
                      {cell.render('Cell')}
                    </div>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default TableView;
