import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Column } from 'react-table';
import { cloneDeep, isEqual } from 'lodash-es';
import ConfirmModal from '@common/components/ConfirmModal';
import { EnumModalAction } from '@common/components/ConfirmModal.types';
import EditableField from '@common/components/EditableField';
import HomeFooter from '@common/components/HomeFooter';
import HomeHeader from '@common/components/HomeHeader';
import HomeMain from '@common/components/HomeMain';
import { useAsyncAction } from '@common/hooks/useAsyncAction';
import {
  onMessage,
  postMessage,
  removeMessageHandler,
} from '@common/services/vscodeService';
import { REVIEW_FILTER_OPTIONS } from '@shared/constants';
import { EnumInputType, EnumMessageType } from '@shared/enums';
import type {
  ColumnConfig,
  ExtensionMessage,
  ProjectOptionResponse,
  ProjectSelectOption,
  ReviewCommentItem,
  ReviewCommentValues,
  ReviewFieldValue,
  ReviewListFilterOption,
  TableDataLoadedPayload,
} from '@shared/types';

/**
 * 主页组件
 *
 * 代码评审系统的主页面，提供完整的评审数据管理功能。
 * 包含项目选择、状态筛选、数据编辑、提交等核心功能。
 *
 * 主要功能：
 * - 项目选择和状态筛选
 * - 评审数据的表格展示和编辑
 * - 编辑数据的本地管理和持久化
 * - 数据提交和重置操作
 * - 与VS Code扩展端的消息通信
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

const HomePage = () => {
  /**
   * 原始评审意见列表（不可修改）
   *
   * 存储从服务器获取的原始数据，作为数据的基础版本。
   * 用于比较编辑后的数据，判断是否有实际修改。
   */
  const [originalReviews, setOriginalReviews] = useState<ReviewCommentItem[]>(
    [],
  );

  /**
   * 新增的评审意见存储
   *
   * 存储本地新增的评审意见，这些数据还未同步到服务器。
   * 新增的数据会显示在列表最上方，且不受筛选条件影响。
   * 使用 Map 格式与编辑数据保持一致。
   */
  const [addData, setAddData] = useState<Map<string, ReviewCommentItem>>(
    new Map(),
  );

  /**
   * 编辑数据存储（只保存修改过的数据）
   *
   * 使用 Map 结构存储用户修改过的行数据，key 为行 ID，value 为修改后的完整行数据。
   * 这样可以避免重复存储未修改的数据，提高性能。
   */
  const [editData, setEditData] = useState<Map<string, ReviewCommentItem>>(
    new Map(),
  );

  /**
   * 项目列表加载状态
   *
   * 控制项目下拉框的加载指示器显示。
   */
  const [projectsLoading, setProjectsLoading] = useState(true);

  /**
   * 项目列表数据
   *
   * 存储所有可选项目的配置信息。
   */
  const [projects, setProjects] = useState<ProjectOptionResponse[]>([]);

  /**
   * 表格列配置
   *
   * 定义表格的列结构、显示规则和编辑类型。
   */
  const [columns, setColumns] = useState<ColumnConfig[]>([]);

  /**
   * 前端查询上下文类型
   *
   * 定义前端使用的查询上下文结构，包含项目选择和筛选类型。
   */
  type FrontendQueryContext = {
    /** 项目选择 */
    project?: ProjectSelectOption;
    /** 筛选类型 */
    statusValue?: ReviewListFilterOption;
  };

  /**
   * 前端查询上下文（包含 UI 选项对象）
   *
   * 存储当前的项目选择和状态筛选配置。
   */
  const [queryContext, setQueryContext] = useState<FrontendQueryContext>({
    project: undefined,
    statusValue: undefined,
  });

  /**
   * 当前编辑的单元格状态
   *
   * 跟踪用户正在编辑的单元格位置，用于控制编辑模式的显示。
   */
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    columnId: string;
  }>();

  /**
   * 统计已编辑的记录数
   *
   * 使用 useMemo 优化性能，只在 editData 变化时重新计算。
   */
  const editedCount = useMemo(() => editData.size, [editData]);

  /**
   * 弹窗开关状态
   *
   * 控制确认弹窗的显示和隐藏。
   */
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [modalAction, setModalAction] = useState<EnumModalAction>(
    EnumModalAction.Reset,
  );

  // 异步消息执行（分离 hook 以便分别控制 loading）
  /** 更新上下文的异步操作 */
  const { execute: runUpdateContext, loading: updatingContextLoading } =
    useAsyncAction();

  /** 提交数据的异步操作 */
  const { execute: runSubmit, loading: submittingLoading } = useAsyncAction();

  /** 查询评论的异步操作 */
  const { execute: runQueryComments, loading: queryingCommentsLoading } =
    useAsyncAction();

  /**
   * 处理表格数据加载完成事件
   *
   * 当扩展端发送表格数据时，更新本地状态并初始化项目选择。
   * 处理列配置、项目列表、评论数据和持久化的编辑数据。
   *
   * @param message - 包含表格数据的消息对象
   */
  const handleTableDataLoaded = useCallback(
    (message: ExtensionMessage<TableDataLoadedPayload>) => {
      // 从消息中提取数据，使用默认值防止解构失败
      const {
        columns = [],
        projects = [],
        comments = [],
        editData: persistedEditData,
        queryContext,
        addData: initialAddData = {},
      } = message.payload || {};

      // 更新加载状态，表示数据已加载完成
      setProjectsLoading(false);

      // 更新表格列配置
      setColumns(columns);

      // 更新项目列表
      setProjects(projects);

      // 更新原始评审数据
      setOriginalReviews(comments);

      // 更新新增的评审意见，将 Record 格式转换为 Map 格式
      if (initialAddData) {
        const addDataMap = new Map(Object.entries(initialAddData));
        setAddData(addDataMap);
      }

      // 如果有持久化的编辑数据，将其转换为 Map 格式并设置到状态中
      // 这确保了页面刷新后用户的编辑内容不会丢失
      if (persistedEditData) {
        const editDataMap = new Map(Object.entries(persistedEditData));
        setEditData(editDataMap);
      }

      // 初始化查询上下文（项目选择和筛选状态）
      if (queryContext) {
        const project =
          queryContext.projectId !== undefined
            ? projects.find(p => p.projectId === queryContext.projectId)
            : undefined;

        const projectOption = project
          ? { value: project.projectId, label: project.projectName }
          : undefined;

        const filterOption =
          queryContext.filterType !== undefined
            ? REVIEW_FILTER_OPTIONS.find(
                option => option.value === queryContext.filterType,
              )
            : undefined;

        setQueryContext({
          project: projectOption,
          statusValue: filterOption,
        });
      }
    },
    [],
  );

  /**
   * 监听表格数据加载消息
   *
   * 在组件挂载时注册消息处理器，在卸载时移除处理器。
   * 确保消息监听器的正确注册和清理。
   */
  useEffect(() => {
    // 注册消息处理器，监听表格数据加载完成事件
    onMessage<TableDataLoadedPayload>(
      EnumMessageType.TableDataLoaded,
      handleTableDataLoaded,
    );

    // 清理函数：组件卸载时移除消息处理器
    return () => {
      removeMessageHandler<TableDataLoadedPayload>(
        EnumMessageType.TableDataLoaded,
        handleTableDataLoaded,
      );
    };
  }, [handleTableDataLoaded]);

  /**
   * 更新表格数据
   *
   * 当用户编辑单元格时，更新编辑数据存储并同步到扩展端。
   * 处理不同输入类型的值更新，并比较原始数据判断是否需要保存。
   *
   * @param value - 用户输入的新值
   * @param row - 当前编辑的行数据
   * @param col - 当前编辑的列配置
   */
  const updateMyData = useCallback(
    (value: string, row: ReviewCommentItem, col: ColumnConfig) => {
      const trimValue = value?.trim();

      // 如果字段必填，且值为空，则不更新
      if (col.required && !trimValue) {
        setEditingCell(undefined);
        return;
      }

      // 更新编辑数据存储
      setEditData(old => {
        // 创建新的 Map 实例，避免直接修改原对象
        const newEditData = new Map(old);

        // 获取已存在的编辑行数据，如果没有则基于原始行数据创建
        const existingRow = newEditData.get(row.id) || cloneDeep(row);

        const { columnCode, inputType, enumValues } = col;

        // 根据列配置更新对应字段的值
        switch (inputType) {
          case EnumInputType.COMBO_BOX:
            // 对于下拉框类型，根据显示名称找到对应的枚举值对象
            existingRow.values[columnCode as keyof ReviewCommentValues] =
              enumValues?.find(item => item.showName === value) ||
              ({} as ReviewFieldValue<string>);
            break;

          default:
            // 对于其他类型，创建标准的字段值对象
            existingRow.values[columnCode as keyof ReviewCommentValues] = {
              value: trimValue,
              showName: trimValue,
            };
        }

        /** 获取原始 row，需要同时从原始评审数据和新增评审意见中查找 */
        const originalRow = originalReviews.find(item => item.id === row.id);
        const isNewRow = addData.has(row.id);

        if (isNewRow) {
          // 如果是新增的行，更新到 addData 中
          setAddData(oldAddData => {
            const newAddData = new Map(oldAddData);
            newAddData.set(row.id, existingRow);
            return newAddData;
          });
        } else {
          // 如果是原始行，判断是否有实际修改
          const isSame = isEqual(originalRow?.values, existingRow.values);

          if (isSame && originalRow) {
            // 如果原始 row 和 existingRow 完全一致，则删除编辑数据
            newEditData.delete(row.id);
          } else {
            // 将更新后的行数据存储到编辑数据 Map 中
            newEditData.set(row.id, existingRow);
          }
        }

        // 发送完整的编辑数据和新增数据到扩展端进行持久化
        // 将 Map 转换为数组格式以便序列化
        postMessage(EnumMessageType.UpdateEditData, {
          editData: Array.from(newEditData.entries()),
          addData: Array.from(addData.entries()),
        });

        return newEditData;
      });

      setEditingCell(undefined);
    },
    [originalReviews, addData],
  );

  /**
   * 开始编辑单元格
   *
   * 设置当前编辑的单元格位置，触发编辑模式。
   *
   * @param rowId - 行ID
   * @param columnId - 列ID
   */
  const handleStartEdit = useCallback((rowId: string, columnId: string) => {
    setEditingCell({ rowId, columnId });
  }, []);

  /**
   * 停止编辑单元格
   *
   * 清除编辑状态，退出编辑模式。
   */
  const handleStopEdit = useCallback(() => {
    setEditingCell(undefined);
  }, []);

  /**
   * 合并原始数据和编辑数据
   *
   * 将用户修改的数据与原始数据合并，生成最终的显示数据。
   * 新增的评审意见会显示在最上方，且不受筛选条件影响。
   * 使用 useMemo 优化性能，只在依赖项变化时重新计算。
   */
  const mergedReviews = useMemo(() => {
    // 1. 处理原始数据和编辑数据的合并
    const processedOriginalReviews = originalReviews.map(review => {
      // 查找是否有该行的编辑数据
      const editedRow = editData.get(review.id);
      if (!editedRow) {
        // 如果没有编辑数据，返回原始行数据
        return review;
      }

      // 如果有编辑数据，返回编辑后的行数据
      return editedRow;
    });

    // 2. 将新增的评审意见放在最前面
    // 新增的评审意见永远在最上方，不接受排序和筛选条件影响
    const addDataArray = Array.from(addData.values());
    return [...addDataArray, ...processedOriginalReviews];
  }, [originalReviews, editData, addData]);

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
   * 监听评论查询完成
   *
   * 用于重置后刷新列表，更新原始评审数据。
   */
  useEffect(() => {
    const handler = (
      message: ExtensionMessage<{ comments: ReviewCommentItem[] }>,
    ) => {
      const { comments = [] } = message.payload || {};
      setOriginalReviews(comments);
    };
    onMessage<{ comments: ReviewCommentItem[] }>(
      EnumMessageType.CommentsLoaded,
      handler,
    );
    return () => {
      removeMessageHandler<{ comments: ReviewCommentItem[] }>(
        EnumMessageType.CommentsLoaded,
        handler,
      );
    };
  }, []);

  /**
   * 监听新增评审意见事件
   *
   * 当有新的评审意见被添加时，更新新增评审意见列表。
   */
  useEffect(() => {
    const handleNewReviewCommentAdded = (
      message: ExtensionMessage<{
        addData: Record<string, ReviewCommentItem>;
      }>,
    ) => {
      const { addData: newAddData = {} } = message.payload || {};
      // 将 Record 格式转换为 Map 格式
      if (newAddData) {
        const addDataMap = new Map(Object.entries(newAddData));
        setAddData(addDataMap);
      }
    };
    onMessage<{ addData: Record<string, ReviewCommentItem> }>(
      EnumMessageType.NewReviewCommentAdded,
      handleNewReviewCommentAdded,
    );
    return () => {
      removeMessageHandler<{
        addData: Record<string, ReviewCommentItem>;
      }>(EnumMessageType.NewReviewCommentAdded, handleNewReviewCommentAdded);
    };
  }, []);

  /**
   * 打开重置确认弹窗
   */
  const handleReset = useCallback(() => {
    setModalAction(EnumModalAction.Reset);
    setShowResetConfirm(true);
  }, []);

  /**
   * 打开提交确认弹窗
   */
  const handleOpenSubmit = useCallback(() => {
    setModalAction(EnumModalAction.Submit);
    setShowResetConfirm(true);
  }, []);

  /**
   * 取消并关闭弹窗
   */
  const handleCancelReset = useCallback(() => {
    setShowResetConfirm(false);
  }, []);

  /**
   * 抽象：查询评论列表
   *
   * 封装评论查询逻辑，提供统一的查询接口。
   */
  const queryComments = useCallback(
    (projectId?: number, type?: string) => {
      return runQueryComments(EnumMessageType.QueryComments, {
        projectId,
        type,
      });
    },
    [runQueryComments],
  );

  /**
   * 重置实现：清空编辑和新增数据并按当前筛选重新查询
   *
   * 清空所有编辑数据和新增数据，并重新查询当前筛选条件下的数据。
   */
  const doReset = useCallback(() => {
    setEditData(new Map());
    setAddData(new Map());
    postMessage(EnumMessageType.UpdateEditData, { editData: [], addData: [] });
    queryComments(queryContext.project?.value, queryContext.statusValue?.value);
  }, [queryContext, queryComments]);

  /**
   * 提交实现：触发扩展端提交流程
   *
   * 先同步查询上下文，再提交编辑数据和新增数据，最后清空本地数据。
   */
  const doSubmit = useCallback(async () => {
    const editDataArray = Array.from(editData.values());
    const addDataArray = Array.from(addData.values());

    // 1) 先同步上下文（等待扩展端确认）
    await runUpdateContext(EnumMessageType.UpdateQueryContext, {
      projectId: queryContext.project?.value,
      type: queryContext.statusValue?.value,
    });

    // 2) 合并编辑数据和新增数据后一起提交
    const allSubmitData = [...editDataArray, ...addDataArray];
    if (allSubmitData.length > 0) {
      await runSubmit(EnumMessageType.SubmitData, {
        submitData: allSubmitData,
      });
    }

    // 3) 提交成功后，清空本地与持久化的数据
    setEditData(new Map());
    setAddData(new Map());
    postMessage(EnumMessageType.UpdateEditData, { editData: [], addData: [] });
  }, [editData, addData, queryContext, runUpdateContext, runSubmit]);

  /**
   * 确认分发
   *
   * 根据弹窗操作类型执行相应的操作。
   */
  const handleConfirm = useCallback(() => {
    setShowResetConfirm(false);
    if (modalAction === EnumModalAction.Reset) {
      doReset();
    } else if (modalAction === EnumModalAction.Submit) {
      void doSubmit();
    }
  }, [modalAction, doReset, doSubmit]);

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
              onStartEdit={() => handleStartEdit(row.id, col.columnCode)}
              onStopEdit={handleStopEdit}
              onUpdate={updateMyData}
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
      handleStartEdit,
      handleStopEdit,
      updateMyData,
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
   * 头部状态统一处理
   *
   * 处理项目选择和状态筛选的变更，同步到扩展端并重新查询数据。
   */
  const handleChangeQueryContext = useCallback(
    ({
      project,
      statusValue,
    }: {
      project?: ProjectSelectOption;
      statusValue?: ReviewListFilterOption;
    }) => {
      const nextProject = project;
      const nextFilter = statusValue;
      setQueryContext({ project: nextProject, statusValue: nextFilter });

      // 1) 同步上下文到扩展端
      postMessage(EnumMessageType.UpdateQueryContext, {
        projectId: nextProject?.value,
        type: nextFilter?.value,
      });

      // 2) 使用最新状态查询列表数据
      queryComments(nextProject?.value, nextFilter?.value);
    },
    [queryComments],
  );

  /**
   * 渲染主页组件
   *
   * 包含头部（项目选择和筛选）、主体（数据表格）和底部组件。
   */
  return (
    <div className="flex h-screen w-full min-w-[600px] flex-col overflow-hidden">
      {/* 头部组件 */}
      <HomeHeader
        projects={projects}
        value={queryContext}
        projectsLoading={projectsLoading}
        onChange={handleChangeQueryContext}
        updatingContextLoading={updatingContextLoading}
        submittingLoading={submittingLoading}
        queryingCommentsLoading={queryingCommentsLoading}
        editedCount={editedCount}
        addedCount={addData.size}
        onReset={handleReset}
        onSubmit={handleOpenSubmit}
      />
      {/* 主体组件 */}
      <HomeMain
        columns={tableColumns}
        dataSource={mergedReviews}
        loading={queryingCommentsLoading}
      />
      {/* 底部组件 */}
      <HomeFooter />

      {/* 重置确认弹窗 */}
      <ConfirmModal
        isOpen={showResetConfirm}
        modalAction={modalAction}
        editDataSize={editData.size}
        addDataSize={addData.size}
        onCancel={handleCancelReset}
        onConfirm={handleConfirm}
      />
    </div>
  );
};

export default HomePage;
