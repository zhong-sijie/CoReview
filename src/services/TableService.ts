import { EnumHttpMethod, EnumReviewListFilter } from "../../shared/enums";
import {
  type ColumnConfig,
  type ProjectOptionResponse,
  type QueryCommentsResponse,
  type ColumnConfigResponse,
  type InitialTableData,
  type ReviewCommentItem,
  CommitCommentsResponse,
} from "../../shared/types";
import { requestApi } from "../utils/request";
import { StateService } from "./StateService";

/**
 * 表格查询参数接口
 *
 * 定义表格数据查询时的通用参数结构
 */
export interface TableQueryParams {
  /** 页码，从1开始 */
  page?: number;
  /** 每页数据条数 */
  pageSize?: number;
  /** 筛选条件对象 */
  filters?: Record<string, unknown>;
  /** 排序条件 */
  sorter?: { field: string; order: "ascend" | "descend" } | null;
}

/**
 * 表格数据项接口
 *
 * 定义表格中单行数据的通用结构
 */
export interface TableItem {
  /** 动态属性，支持任意字段 */
  [key: string]: unknown;
}

/**
 * 表格数据响应接口
 *
 * 定义表格数据查询的响应结构
 */
export interface TableDataResponse<T extends TableItem = TableItem> {
  /** 数据列表 */
  list: T[];
  /** 总数据条数 */
  total: number;
}

/**
 * 查询评审意见列表请求参数接口
 *
 * 定义评审评论查询的参数结构
 */
export interface CommentQueryParams {
  /** 项目ID，可选 */
  projectId?: number;
  /** 筛选类型 */
  type?: EnumReviewListFilter;
}

/**
 * 表格服务
 *
 * 统一管理：列配置、搜索字典、表格数据获取与相关缓存
 *
 * 主要功能：
 * - 获取列配置信息
 * - 获取项目列表
 * - 查询和提交评审评论
 * - 管理编辑数据的持久化
 */
export class TableService {
  /** 单例实例 */
  private static instance: TableService;

  /**
   * 私有构造函数
   *
   * 防止外部直接实例化，强制使用单例模式
   */
  private constructor() {}

  /**
   * 获取TableService的单例实例
   *
   * 如果实例不存在则创建新实例，如果已存在则返回现有实例
   */
  public static getInstance(): TableService {
    if (!TableService.instance) {
      TableService.instance = new TableService();
    }
    return TableService.instance;
  }

  /**
   * 获取列配置
   *
   * 从后端获取表格的列定义信息，包括显示控制、编辑权限等
   *
   * 执行流程：
   * 1. 调用 /client/system/pullColumnDefines 接口
   * 2. 返回列配置数组，失败时返回空数组
   */
  public async loadGetColumnConfig(): Promise<ColumnConfig[]> {
    try {
      const response = await requestApi<ColumnConfigResponse>({
        url: "/client/system/pullColumnDefines",
        method: EnumHttpMethod.Get,
      });

      return response.columns;
    } catch {
      return [];
    }
  }

  /**
   * 获取搜索条件字典
   *
   * 从后端获取搜索相关的字典数据，用于下拉选择等场景
   *
   * 注意：示例结构，后续可按实际接口调整
   */
  public async loadGetSearchDictionaries(): Promise<ColumnConfig> {
    const data = await requestApi<ColumnConfig>({
      url: "/client/system/pullSearchDictionaries",
      method: EnumHttpMethod.Get,
    });
    return data;
  }

  /**
   * 获取用户可访问的项目列表
   *
   * 获取当前用户有权限访问的所有项目，用于Header区域展示
   *
   * 执行流程：
   * 1. 调用 /client/project/getMyProjects 接口
   * 2. 返回项目列表，失败时返回空数组
   */
  public async loadGetMyProjects(): Promise<ProjectOptionResponse[]> {
    try {
      const data = await requestApi<ProjectOptionResponse[]>({
        url: "/client/project/getMyProjects",
        method: EnumHttpMethod.Get,
      });
      return data.map((p: ProjectOptionResponse) => ({
        projectId: p.projectId,
        projectName: p.projectName,
      }));
    } catch {
      return [];
    }
  }

  /**
   * 并行获取：列配置 + 项目列表
   *
   * 同时获取表格初始化所需的所有数据，包括列配置、项目列表和评论数据
   *
   * 执行流程：
   * 1. 获取持久化的查询上下文状态
   * 2. 并行获取列配置和项目列表
   * 3. 检查持久化的项目ID是否还存在
   * 4. 使用最终的查询上下文获取评论数据
   * 5. 返回完整的初始化数据
   */
  public async loadGetInitialTable(): Promise<InitialTableData> {
    // 获取持久化的查询上下文状态
    const stateService = StateService.getInstance();
    const queryContext = stateService.getQueryContext();

    // 先获取列配置和项目列表
    const [columns, projects] = await Promise.all([
      this.loadGetColumnConfig(),
      this.loadGetMyProjects(),
    ]);

    // 检查持久化的项目ID是否还存在
    let finalQueryContext = queryContext;
    if (queryContext?.projectId !== undefined) {
      const projectExists = projects.some(
        (p) => p.projectId === queryContext.projectId
      );
      if (!projectExists) {
        // 项目不存在，重置查询上下文
        finalQueryContext = null;
        stateService.setQueryContext(null);
      }
    }

    // 使用最终的查询上下文获取评论数据
    const commentsResp = await this.loadQueryComments({
      projectId: finalQueryContext?.projectId,
      type: finalQueryContext?.filterType || EnumReviewListFilter.All,
    });

    return {
      columns,
      projects,
      comments: commentsResp.comments,
      queryContext: finalQueryContext,
    };
  }

  /**
   * 获取表格数据
   *
   * 根据查询参数获取表格数据，支持分页、筛选、排序
   */
  public async loadGetTableData<T extends TableItem = TableItem>(
    params: TableQueryParams
  ): Promise<TableDataResponse<T>> {
    const data = await requestApi<TableDataResponse<T>>({
      url: "/client/review/list",
      method: EnumHttpMethod.Post,
      data: params,
    });
    return data;
  }

  /**
   * 查询评审意见列表
   *
   * 根据项目ID和筛选类型查询评审评论列表
   *
   * 执行流程：
   * 1. 调用 /client/comment/queryList 接口
   * 2. 对返回的评论列表进行倒序处理
   * 3. 返回处理后的评论数据
   */
  public async loadQueryComments(
    params: CommentQueryParams
  ): Promise<QueryCommentsResponse> {
    const data = await requestApi<QueryCommentsResponse>({
      url: "/client/comment/queryList",
      method: EnumHttpMethod.Post,
      data: params,
    });
    // 统一在此处进行倒序，调用方拿到的即为倒序后的列表
    return { ...data, comments: data.comments.toReversed() };
  }

  /**
   * 提交评审意见
   *
   * 将用户编辑的评审评论提交到后端保存
   *
   * 执行流程：
   * 1. 调用 /client/comment/commitComments 接口
   * 2. 返回后端处理结果
   */
  public async loadCommitComments(payload: {
    comments: ReviewCommentItem[];
  }): Promise<CommitCommentsResponse> {
    const data = await requestApi<CommitCommentsResponse>({
      url: "/client/comment/commitComments",
      method: EnumHttpMethod.Post,
      data: payload,
    });
    // 后端直接返回最终结构
    return data;
  }

  /**
   * 保存编辑数据到扩展端持久化存储
   *
   * 将用户编辑过的表格数据保存到本地存储，用于恢复编辑状态
   *
   * 执行流程：
   * 1. 将Map格式的编辑数据转换为对象格式
   * 2. 通过StateService保存到扩展端状态
   */
  public async saveEditData(
    editData: Array<[string, ReviewCommentItem]>
  ): Promise<void> {
    try {
      // 将 Map 格式的编辑数据转换为对象格式，便于持久化
      const editDataObject = Object.fromEntries(editData);

      // 获取状态服务实例
      const stateService = StateService.getInstance();

      // 保存编辑数据到扩展端状态
      stateService.setEditData(editDataObject);
    } catch {
      // ignore
    }
  }

  /**
   * 获取持久化的编辑数据
   *
   * 从本地存储中获取用户之前编辑过的表格数据
   *
   * 执行流程：
   * 1. 通过StateService获取编辑数据
   * 2. 失败时返回null
   */
  public getPersistedEditData(): Record<string, ReviewCommentItem> | null {
    try {
      const stateService = StateService.getInstance();
      return stateService.getEditData();
    } catch {
      return null;
    }
  }
}
