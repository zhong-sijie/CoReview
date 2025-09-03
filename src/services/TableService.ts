import { EnumHttpMethod, EnumReviewListFilter } from '../../shared/enums';
import {
  type ColumnConfig,
  type ColumnConfigResponse,
  CommitCommentsResponse,
  type InitialTableData,
  type ProjectOptionResponse,
  type QueryCommentsResponse,
  type ReviewCommentItem,
} from '../../shared/types';
import { getArrayLength, getObjectKeyCount } from '../../shared/utils';
import { requestApi } from '../utils/request';
import { LogService } from './LogService';
import { StateService } from './StateService';

/**
 * 查询评审意见列表请求参数接口
 *
 * 定义评审评论查询的参数结构，支持按项目和筛选类型查询。
 */
export interface CommentQueryParams {
  /** 项目ID，可选，用于限定查询范围 */
  projectId?: number;
  /** 筛选类型，对应 EnumReviewListFilter 枚举值 */
  type?: EnumReviewListFilter;
}

/**
 * 表格服务
 *
 * 统一管理列配置、搜索字典、表格数据获取与相关缓存。
 * 采用单例模式确保全局只有一个表格服务实例。
 *
 * 主要功能：
 * - 获取列配置信息
 * - 获取项目列表
 * - 查询和提交评审评论
 * - 管理编辑数据的持久化
 */
export class TableService {
  /** 单例实例，确保全局只有一个表格服务 */
  private static instance: TableService;

  /** 日志服务实例 */
  private log: LogService = LogService.getInstance();

  /**
   * 私有构造函数
   *
   * 防止外部直接实例化，强制使用单例模式。
   * 通过 getInstance() 方法获取实例。
   */
  private constructor() {}

  /**
   * 获取TableService的单例实例
   *
   * 如果实例不存在则创建新实例，如果已存在则返回现有实例。
   * 确保整个应用中只有一个表格服务实例。
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
   * 优先从缓存获取列配置，如果缓存不存在则从后端获取并持久化。
   * 列配置包含表格的显示规则、编辑权限、导出设置等信息。
   *
   * 执行流程：
   * 1. 优先从 StateService 获取缓存的列配置
   * 2. 如果缓存存在且有效，直接返回缓存数据
   * 3. 如果缓存不存在，调用 /client/system/pullColumnDefines 接口
   * 4. 将获取到的列配置保存到缓存中
   * 5. 返回列配置数组，失败时返回空数组
   *
   * @returns 列配置数组，失败时返回空数组
   */
  public async loadGetColumnConfig(): Promise<ColumnConfig[]> {
    // 优先从缓存获取
    const stateService = StateService.getInstance();
    const cachedColumns = stateService.getColumnConfig();

    if (cachedColumns && cachedColumns.length > 0) {
      return cachedColumns;
    }

    // 缓存不存在，从后端获取
    try {
      this.log.debug('拉取列配置', 'TableService');
      const response = await requestApi<ColumnConfigResponse>({
        url: '/client/system/pullColumnDefines',
        method: EnumHttpMethod.Get,
      });

      const columns = response.columns;

      // 将获取到的列配置保存到缓存中
      if (columns && columns.length > 0) {
        stateService.setColumnConfig(columns);
      }

      this.log.debug('拉取列配置完成', 'TableService', {
        columnsCount: getArrayLength(columns),
      });
      return columns;
    } catch {
      this.log.warn('拉取列配置失败', 'TableService');
      return [];
    }
  }

  /**
   * 获取用户可访问的项目列表
   *
   * 获取当前用户有权限访问的所有项目，用于Header区域展示。
   * 项目列表用于用户选择要查询的项目范围。
   *
   * 执行流程：
   * 1. 调用 /client/project/getMyProjects 接口
   * 2. 返回项目列表，失败时返回空数组
   *
   * @returns 项目列表数组，失败时返回空数组
   */
  public async loadGetMyProjects(): Promise<ProjectOptionResponse[]> {
    try {
      this.log.debug('拉取项目列表', 'TableService');
      const data = await requestApi<ProjectOptionResponse[]>({
        url: '/client/project/getMyProjects',
        method: EnumHttpMethod.Get,
      });
      const projects = data.map((p: ProjectOptionResponse) => ({
        projectId: p.projectId,
        projectName: p.projectName,
      }));
      this.log.debug('拉取项目列表完成', 'TableService', {
        projectsCount: getArrayLength(projects),
      });
      return projects;
    } catch {
      this.log.warn('拉取项目列表失败', 'TableService');
      return [];
    }
  }

  /**
   * 并行获取：列配置 + 项目列表
   *
   * 同时获取表格初始化所需的所有数据，包括列配置、项目列表和评论数据。
   * 列配置会被自动持久化到缓存中，提高后续访问性能。
   *
   * 执行流程：
   * 1. 获取持久化的查询上下文状态
   * 2. 并行获取列配置和项目列表（列配置会自动缓存）
   * 3. 检查持久化的项目ID是否还存在
   * 4. 使用最终的查询上下文获取评论数据
   * 5. 返回完整的初始化数据
   *
   * @returns 包含列配置、项目列表、评论数据和查询上下文的完整数据
   */
  public async loadGetInitialTable(): Promise<InitialTableData> {
    // 获取持久化的查询上下文状态
    const stateService = StateService.getInstance();
    const queryContext = stateService.getQueryContext();

    this.log.debug('获取初始表格数据', 'TableService', {
      serverUrl: stateService.getServerUrl(),
      connectionOk: stateService.getState().connectionOk,
      loggedIn: stateService.getState().loggedIn,
      queryContext,
    });

    // 先获取列配置和项目列表（列配置会自动缓存）
    const [columns, projects] = await Promise.all([
      this.loadGetColumnConfig(),
      this.loadGetMyProjects(),
    ]);

    // 检查持久化的项目ID是否还存在
    let finalQueryContext = queryContext;
    if (queryContext?.projectId !== undefined) {
      const projectExists = projects.some(
        p => p.projectId === queryContext.projectId,
      );
      if (!projectExists) {
        // 项目不存在，重置查询上下文
        finalQueryContext = null;
        stateService.setQueryContext(null);
      }
    }

    // 使用最终的查询上下文获取评论数据
    let commentsResp: QueryCommentsResponse = { comments: [] } as any;
    try {
      commentsResp = await this.loadQueryComments({
        projectId: finalQueryContext?.projectId,
        type: finalQueryContext?.filterType,
      });
    } catch (e) {
      this.log.warn('获取评论列表失败', 'TableService', {
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }

    this.log.debug('获取初始表格数据完成', 'TableService', {
      columnsCount: getArrayLength(columns),
      projectsCount: getArrayLength(projects),
      commentsCount: getArrayLength(commentsResp.comments),
      queryContext: finalQueryContext,
    });
    return {
      columns,
      projects,
      comments: commentsResp.comments,
      queryContext: finalQueryContext,
    };
  }

  /**
   * 查询评审意见列表
   *
   * 根据项目ID和筛选类型查询评审评论列表。
   * 返回的评论列表会自动进行倒序处理，确保最新的评论在前面。
   *
   * 执行流程：
   * 1. 调用 /client/comment/queryList 接口
   * 2. 对返回的评论列表进行倒序处理
   * 3. 返回处理后的评论数据
   *
   * @param params 查询参数，包含项目ID和筛选类型
   * @returns 评论查询响应，包含倒序后的评论列表
   */
  public async loadQueryComments(
    params: CommentQueryParams,
  ): Promise<QueryCommentsResponse> {
    this.log.debug('按条件查询评论', 'TableService', { params });
    const data = await requestApi<QueryCommentsResponse>({
      url: '/client/comment/queryList',
      method: EnumHttpMethod.Post,
      data: params,
    });
    // 统一在此处进行倒序，调用方拿到的即为倒序后的列表
    const resp = { ...data, comments: data.comments.toReversed() };
    this.log.debug('查询评论完成', 'TableService', {
      commentsCount: getArrayLength(resp.comments),
    });
    return resp;
  }

  /**
   * 提交评审意见
   *
   * 将用户编辑的评审评论提交到后端保存。
   * 支持批量提交多条评审意见。
   *
   * 执行流程：
   * 1. 调用 /client/comment/commitComments 接口
   * 2. 返回后端处理结果
   *
   * @param payload 提交数据，包含要提交的评论列表
   * @returns 提交结果，包含成功/失败状态和详细信息
   */
  public async loadCommitComments(payload: {
    comments: ReviewCommentItem[];
  }): Promise<CommitCommentsResponse> {
    this.log.debug('提交评审意见', 'TableService', {
      count: getArrayLength(payload?.comments),
    });
    const data = await requestApi<CommitCommentsResponse>({
      url: '/client/comment/commitComments',
      method: EnumHttpMethod.Post,
      data: payload,
    });
    // 后端直接返回最终结构
    this.log.info('提交评审意见完成', 'TableService', {
      success: data?.success,
      error: data?.errDesc,
    });
    return data;
  }

  /**
   * 保存数据到扩展端持久化存储
   *
   * 将用户编辑过的表格数据和新增数据保存到本地存储。
   * 支持编辑数据和新增数据的分别保存，便于后续恢复和同步。
   *
   * 执行流程：
   * 1. 将Map格式的编辑数据转换为对象格式并保存
   * 2. 将Map格式的新增数据转换为对象格式并保存
   *
   * @param editData 编辑数据数组，每个元素为 [记录ID, 评论项] 的元组
   * @param addData 新增数据数组，每个元素为 [记录ID, 评论项] 的元组
   */
  public async saveData(
    editData: Array<[string, ReviewCommentItem]>,
    addData: Array<[string, ReviewCommentItem]>,
  ): Promise<void> {
    try {
      // 获取状态服务实例
      const stateService = StateService.getInstance();

      // 保存编辑数据
      const editDataObject =
        editData.length > 0 ? Object.fromEntries(editData) : null;
      stateService.setEditData(editDataObject);

      // 保存新增数据（保持调用方给定的顺序与内容）
      const addDataObject =
        addData.length > 0 ? Object.fromEntries(addData) : null;
      if (addDataObject) {
        stateService.setAddData(addDataObject);
      } else {
        stateService.clearAddData();
      }
      this.log.debug('持久化保存编辑与新增数据', 'TableService', {
        editCount: getObjectKeyCount(editDataObject),
        addCount: getObjectKeyCount(addDataObject),
      });
    } catch (e) {
      this.log.warn('保存数据时异常', 'TableService', { error: e });
    }
  }

  /**
   * 获取持久化的编辑数据
   *
   * 从本地存储中获取用户之前编辑过的表格数据。
   * 用于在会话间保持用户的编辑状态，提高用户体验。
   *
   * 执行流程：
   * 1. 通过StateService获取编辑数据
   * 2. 失败时返回null
   *
   * @returns 编辑数据对象，无数据时返回null
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
