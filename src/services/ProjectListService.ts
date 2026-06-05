import dayjs from 'dayjs';
import { EnumHttpMethod } from '../../shared/enums';
import type { ProjectOptionResponse } from '../../shared/types';
import { requestApi } from '../utils/request';
import { LogService } from './LogService';
import { StateService } from './StateService';

export type ProjectFetchReason = 'manual' | 'initial' | 'addReview';

export type EnsureProjectsResult = {
  projects: ProjectOptionResponse[];
  fetchedFromNetwork: boolean;
};

export class ProjectListService {
  private static instance: ProjectListService;

  private log = LogService.getInstance();

  /** 并发请求去重，避免 manual / initial 等路径重复拉取 */
  private fetchInflight: Promise<ProjectOptionResponse[]> | null = null;

  private constructor() {}

  public static getInstance(): ProjectListService {
    if (!ProjectListService.instance) {
      ProjectListService.instance = new ProjectListService();
    }
    return ProjectListService.instance;
  }

  public async ensureProjectsFresh(
    reason: ProjectFetchReason,
  ): Promise<EnsureProjectsResult> {
    const stateService = StateService.getInstance();
    const app = stateService.getState();

    if (!app.loggedIn || !stateService.getServerUrl()) {
      return {
        projects: stateService.getProjects(),
        fetchedFromNetwork: false,
      };
    }

    const today = dayjs().format('YYYY-MM-DD');
    const shouldFetch =
      reason === 'manual' ||
      reason === 'initial' ||
      (reason === 'addReview' &&
        stateService.getLastAutoProjectsRefreshDate() !== today);

    if (!shouldFetch) {
      return {
        projects: stateService.getProjects(),
        fetchedFromNetwork: false,
      };
    }

    try {
      const projects = await this.fetchProjectsFromNetwork();
      await stateService.setProjects(projects);
      if (reason === 'addReview' && projects.length > 0) {
        await stateService.setLastAutoProjectsRefreshDate(today);
      }
      this.log.info('项目列表已刷新', 'ProjectListService', {
        reason,
        count: projects.length,
      });
      return { projects, fetchedFromNetwork: true };
    } catch (e) {
      this.log.warn('拉取项目列表失败，使用缓存', 'ProjectListService', {
        reason,
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        projects: stateService.getProjects(),
        fetchedFromNetwork: false,
      };
    }
  }

  private async fetchProjectsFromNetwork(): Promise<ProjectOptionResponse[]> {
    if (!this.fetchInflight) {
      this.fetchInflight = this.fetchFromApi().finally(() => {
        this.fetchInflight = null;
      });
    }
    return this.fetchInflight;
  }

  private async fetchFromApi(): Promise<ProjectOptionResponse[]> {
    const data = await requestApi<ProjectOptionResponse[]>({
      url: '/client/project/getMyProjects',
      method: EnumHttpMethod.Get,
    });
    return data.map(p => ({
      projectId: p.projectId,
      projectName: p.projectName,
    }));
  }
}
