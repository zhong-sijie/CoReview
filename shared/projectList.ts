import { EnumInputType } from './enums';
import type { ColumnConfig, EnumOption, ProjectOptionResponse } from './types';

export function projectsToEnumOptions(
  projects: ProjectOptionResponse[],
): EnumOption[] {
  return projects.map(p => ({
    value: String(p.projectId),
    showName: p.projectName,
  }));
}

export function injectProjectEnumValues(
  columns: ColumnConfig[],
  projects: ProjectOptionResponse[],
): ColumnConfig[] {
  if (projects.length === 0) {
    return columns;
  }
  const enumValues = projectsToEnumOptions(projects);
  return columns.map(col =>
    col.columnCode === 'projectId' && col.inputType === EnumInputType.COMBO_BOX
      ? { ...col, enumValues }
      : col,
  );
}
