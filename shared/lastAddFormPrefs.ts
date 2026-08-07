import type {
  ColumnConfig,
  FormFieldPrefValue,
  LastAddFormPrefsFields,
} from './types';

/** 添加表单偏好缓存 TTL：3 天 */
export const LAST_ADD_FORM_PREFS_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** 永不缓存 / 永不从缓存恢复的字段 */
export const NEVER_CACHE_COLUMN_CODES = new Set(['content', 'comment']);

export function isLastAddFormPrefsExpired(
  savedAt: number,
  now: number = Date.now(),
): boolean {
  return now - savedAt >= LAST_ADD_FORM_PREFS_TTL_MS;
}

function isFormFieldPrefValue(value: unknown): value is FormFieldPrefValue {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as FormFieldPrefValue;
  return (
    typeof candidate.value === 'string' &&
    typeof candidate.showName === 'string'
  );
}

/**
 * 从提交表单抽出可缓存偏好字段。
 * 跳过：永不缓存码、不可编辑、前端强制禁用、空值。
 */
export function extractLastAddFormPrefs(
  data: Record<string, FormFieldPrefValue>,
  columns: ColumnConfig[],
  options?: { forceDisabledCodes?: Iterable<string> },
): LastAddFormPrefsFields {
  const forceDisabled = new Set(options?.forceDisabledCodes ?? []);
  const prefs: LastAddFormPrefsFields = {};

  for (const column of columns) {
    const code = column.columnCode;
    if (!column.showInAddPage) {
      continue;
    }
    if (!column.editableInAddPage) {
      continue;
    }
    if (NEVER_CACHE_COLUMN_CODES.has(code) || forceDisabled.has(code)) {
      continue;
    }

    const field = data[code];
    if (!field || typeof field.value !== 'string' || field.value === '') {
      continue;
    }

    prefs[code] = {
      value: field.value,
      showName: field.showName ?? '',
    };
  }

  return prefs;
}

function isPrefAllowedByColumn(
  column: ColumnConfig | undefined,
  field: FormFieldPrefValue,
): boolean {
  if (!field.value) {
    return false;
  }
  const enumValues = column?.enumValues;
  if (!enumValues?.length) {
    return true;
  }
  return enumValues.some(opt => opt.value === field.value);
}

/**
 * 将缓存偏好合并进 initialData（返回新对象）。
 * 不覆盖 projectId / content / comment；枚举不匹配则跳过。
 */
export function applyLastAddFormPrefs(
  initialData: Record<string, FormFieldPrefValue>,
  columns: ColumnConfig[],
  prefs: LastAddFormPrefsFields | null | undefined,
): Record<string, FormFieldPrefValue> {
  if (!prefs || !Object.keys(prefs).length) {
    return { ...initialData };
  }

  const next = { ...initialData };
  const columnByCode = new Map(
    columns.map(column => [column.columnCode, column]),
  );

  for (const [code, cached] of Object.entries(prefs)) {
    if (NEVER_CACHE_COLUMN_CODES.has(code)) {
      continue;
    }
    if (!isFormFieldPrefValue(cached)) {
      continue;
    }

    const column = columnByCode.get(code);
    if (!column?.showInAddPage || !column.editableInAddPage) {
      continue;
    }
    if (!isPrefAllowedByColumn(column, cached)) {
      continue;
    }

    const matched = column.enumValues?.find(opt => opt.value === cached.value);
    next[code] = matched
      ? { value: matched.value, showName: matched.showName }
      : { value: cached.value, showName: cached.showName };
  }

  return next;
}
