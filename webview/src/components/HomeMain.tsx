import React from "react";
import { Column, useRowSelect, useSortBy, useTable } from "react-table";
import { ReviewCommentItem } from "@shared/types";

/**
 * 主页主体组件的属性接口
 *
 * 定义主页主体组件所需的所有属性，包括表格配置、数据和状态。
 * 负责渲染评审评论的数据表格。
 */
interface Props {
  /** 列配置，定义表格的列结构和渲染方式 */
  columns: Column<ReviewCommentItem>[];
  /** 数据源，包含所有评审评论数据 */
  dataSource: ReviewCommentItem[];
  /** 表格加载状态，控制加载提示的显示 */
  loading?: boolean;
}

/**
 * 主页主体组件
 *
 * 使用react-table库渲染评审评论的数据表格，支持排序、选择等功能。
 * 提供加载状态和空数据状态的友好提示。
 *
 * 主要功能：
 * - 数据表格渲染：使用react-table实现高性能表格
 * - 排序功能：支持点击表头进行排序
 * - 行选择：支持行选择功能（通过useRowSelect）
 * - 响应式设计：支持水平滚动
 * - 主题适配：使用VS Code主题变量
 */
const HomeMain = (props: Props) => {
  const { columns, dataSource, loading } = props;

  /**
   * 使用react-table的hooks配置表格功能
   *
   * useTable: 核心表格功能
   * useSortBy: 排序功能
   * useRowSelect: 行选择功能
   */
  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    useTable({ columns, data: dataSource }, useSortBy, useRowSelect);

  /**
   * 渲染加载状态
   *
   * 当loading为true时显示加载提示
   */
  if (loading) {
    return (
      <div className="h-[200px] grid place-items-center text-center gap-4">
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
      <div className="h-[200px] grid place-items-center text-center gap-4">
        <p className="m-0 opacity-70">暂无代码审查数据</p>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-auto">
      <div className="overflow-x-auto">
        <table
          {...getTableProps()}
          className="w-full border-collapse table-fixed border border-[var(--vscode-border)]"
        >
          <thead>
            {headerGroups.map((headerGroup) => (
              <tr
                {...headerGroup.getHeaderGroupProps()}
                className="bg-[var(--vscode-list-hoverBackground)]"
              >
                {headerGroup.headers.map((column) => (
                  <th
                    {...column.getHeaderProps(
                      // 切换排序，仅允许单列
                      (column as any).getSortByToggleProps?.() || {}
                    )}
                    className="text-center text-sm font-medium border-b border-r border-[var(--vscode-border)] text-[var(--vscode-foreground)]"
                    style={{ width: `${100 / columns.length}%` }}
                  >
                    <div className="flex items-center justify-center gap-1 select-none">
                      {column.render("Header")}
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
            {rows.map((row) => {
              prepareRow(row);
              return (
                <tr
                  {...row.getRowProps()}
                  className="border-b border-[var(--vscode-border)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                >
                  {row.cells.map((cell) => (
                    <td
                      {...cell.getCellProps()}
                      className="text-sm border-r border-[var(--vscode-border)]"
                      style={{ width: `${100 / columns.length}%` }}
                    >
                      <div className="truncate" title={cell.value?.title}>
                        {cell.render("Cell")}
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
};

export default HomeMain;
