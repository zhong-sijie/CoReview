import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import Select from 'react-select';
import { yupResolver } from '@hookform/resolvers/yup';
import dayjs from 'dayjs';
import * as yup from 'yup';
import { useAsyncAction } from '@common/hooks/useAsyncAction';
import {
  onMessage,
  removeMessageHandler,
} from '@common/services/vscodeService';
import {
  EnumCommentOperateType,
  EnumConfirmResult,
  EnumInputType,
  EnumMessageType,
} from '@shared/enums';
import type {
  ColumnConfig,
  EnumOption,
  ExtensionMessage,
  ReviewCommentItem,
  UserDetail,
} from '@shared/types';
import { createUniqueId } from '@shared/utils';

// ==================== 样式常量 ====================

const STYLES = {
  // 容器样式
  container:
    'min-h-screen bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]',
  form: 'mb-8 bg-[var(--vscode-editor-background)] rounded-lg border border-[var(--vscode-panel-border)]',
  formContent: 'p-4',
  formGrid: 'grid grid-cols-1 md:grid-cols-2 gap-6',
  formActions: 'px-4 pb-4 flex justify-end',

  // 字段样式
  fieldContainer: 'space-y-2',
  fieldLabel:
    'block text-sm font-medium text-[var(--vscode-editor-foreground)]',
  fieldError:
    'text-xs text-[var(--vscode-inputValidation-errorForeground)] mt-1',
  fieldHelp: 'text-xs text-[var(--vscode-descriptionForeground)]',
  requiredMark: 'text-[var(--vscode-inputValidation-errorForeground)] ml-1',

  // 按钮样式
  button: 'px-6 py-2 rounded-lg transition-colors',
  buttonPrimary:
    'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]',
  buttonSecondary:
    'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] cursor-not-allowed',

  // 错误状态样式
  errorContainer:
    'mb-8 bg-[var(--vscode-inputValidation-errorBackground)] border border-[var(--vscode-inputValidation-errorBorder)] rounded-lg p-4',
  errorIcon: 'h-5 w-5 text-[var(--vscode-inputValidation-errorForeground)]',
  errorTitle:
    'text-sm font-medium text-[var(--vscode-inputValidation-errorForeground)]',
  errorMessage: 'text-sm text-[var(--vscode-inputValidation-errorForeground)]',
} as const;

// ==================== 类型定义 ====================

/**
 * 表单数据格式 - 统一使用 {value: string, showName: string}
 */
type FormFieldValue = {
  value: string;
  showName: string;
};

type FormData = {
  [key: string]: FormFieldValue;
};

/**
 * 选中文本信息
 */
type SelectedTextPayload = {
  text: string;
  lineNumber: string;
  filePath: string;
  fileSnapshot: string; // 整个文件内容快照
};

/**
 * Git 信息
 */
type GitInfoPayload = {
  repositoryUrl: string | null;
  branchName: string | null;
};

/**
 * Editorial 页面初始化数据
 */
type EditorialInitPayload = {
  authState: any;
  selectedTextInfo: SelectedTextPayload;
  gitInfo: GitInfoPayload;
  userDetail: UserDetail | null;
  columns: ColumnConfig[];
};

/**
 * 字段配置
 */
interface FieldConfig {
  columnCode: string;
  getDefaultValue?: (context: EditorialContext) => FormFieldValue;
  forceDisabled?: boolean;
  forceRequired?: boolean;
  hidden?: boolean;
}

/**
 * 上下文数据
 */
type EditorialContext = {
  selectedTextInfo: SelectedTextPayload | null;
  gitInfo: GitInfoPayload | null;
  userDetail: UserDetail | null;
};

/**
 * Select 选项格式
 */
interface SelectOption {
  value: string;
  label: string;
}

// ==================== 工具函数 ====================

/**
 * 使用 dayjs 格式化当前时间为 YYYY-MM-DD HH:mm:ss 格式
 */
const formatCurrentDateTime = (): string => {
  return dayjs().format('YYYY-MM-DD HH:mm:ss');
};

/**
 * 创建 Select 样式配置
 */
const createSelectStyles = (hasError: boolean) => ({
  control: (provided: any, state: any) => ({
    ...provided,
    minHeight: '48px',
    backgroundColor: 'var(--vscode-input-background)',
    borderColor: hasError
      ? 'var(--vscode-inputValidation-errorBorder)'
      : state.isFocused
        ? 'var(--vscode-focusBorder)'
        : 'var(--vscode-input-border)',
    boxShadow: state.isFocused ? '0 0 0 1px var(--vscode-focusBorder)' : 'none',
    '&:hover': {
      borderColor: state.isFocused
        ? 'var(--vscode-focusBorder)'
        : 'var(--vscode-input-border)',
    },
  }),
  singleValue: (provided: any) => ({
    ...provided,
    color: 'var(--vscode-input-foreground)',
  }),
  input: (provided: any) => ({
    ...provided,
    color: 'var(--vscode-input-foreground)',
  }),
  placeholder: (provided: any) => ({
    ...provided,
    color: 'var(--vscode-descriptionForeground)',
  }),
  menu: (provided: any) => ({
    ...provided,
    backgroundColor: 'var(--vscode-dropdown-background)',
    border: '1px solid var(--vscode-dropdown-border)',
  }),
  option: (provided: any, state: any) => ({
    ...provided,
    backgroundColor: state.isSelected
      ? 'var(--vscode-list-activeSelectionBackground)'
      : state.isFocused
        ? 'var(--vscode-list-hoverBackground)'
        : 'var(--vscode-dropdown-background)',
    color: state.isSelected
      ? 'var(--vscode-list-activeSelectionForeground)'
      : 'var(--vscode-dropdown-foreground)',
    '&:hover': {
      backgroundColor: state.isSelected
        ? 'var(--vscode-list-activeSelectionBackground)'
        : 'var(--vscode-list-hoverBackground)',
    },
  }),
});

/**
 * 基础输入框样式类
 */
const getInputBaseClasses = (hasError: boolean, disabled: boolean) => {
  return `w-full p-3 border rounded-lg focus:outline-none focus:ring-1 focus:ring-[var(--vscode-focusBorder)] focus:border-[var(--vscode-focusBorder)] transition-colors bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)] ${
    hasError ? 'border-[var(--vscode-inputValidation-errorBorder)]' : ''
  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;
};

// ==================== 表单字段组件 ====================

/**
 * 文本输入字段
 */
const TextInputField = ({
  field,
  error,
  disabled,
  placeholder,
}: {
  field: any;
  error: any;
  disabled: boolean;
  placeholder: string;
}) => (
  <input
    {...field}
    type="text"
    className={getInputBaseClasses(!!error, disabled)}
    disabled={disabled}
    placeholder={placeholder}
    value={field.value?.value || ''}
    onChange={e => {
      const inputValue = e.target.value;
      field.onChange({
        value: inputValue,
        showName: inputValue,
      });
    }}
  />
);

/**
 * 文本域字段
 */
const TextareaField = ({
  field,
  error,
  disabled,
  placeholder,
}: {
  field: any;
  error: any;
  disabled: boolean;
  placeholder: string;
}) => (
  <textarea
    {...field}
    className={`${getInputBaseClasses(
      !!error,
      disabled,
    )} h-24 resize-none whitespace-pre-wrap break-words font-mono text-sm leading-relaxed`}
    disabled={disabled}
    placeholder={placeholder}
    value={field.value?.value || ''}
    onChange={e => {
      const inputValue = e.target.value;
      field.onChange({
        value: inputValue,
        showName: inputValue,
      });
    }}
  />
);

/**
 * 日期选择字段
 */
const DateField = ({
  field,
  error,
  disabled,
}: {
  field: any;
  error: any;
  disabled: boolean;
}) => (
  <input
    {...field}
    type="date"
    className={getInputBaseClasses(!!error, disabled)}
    disabled={disabled}
    value={field.value?.value || ''}
    onChange={e => {
      const inputValue = e.target.value;
      field.onChange({
        value: inputValue,
        showName: inputValue,
      });
    }}
  />
);

/**
 * 下拉选择字段
 */
const SelectField = ({
  field,
  error,
  disabled,
  placeholder,
  enumValues,
}: {
  field: any;
  error: any;
  disabled: boolean;
  placeholder: string;
  enumValues?: EnumOption[];
}) => {
  const options: SelectOption[] = useMemo(() => {
    return (
      enumValues?.map(option => ({
        value: option.value,
        label: option.showName,
      })) || []
    );
  }, [enumValues]);

  const selectedOption = options.find(
    option => option.value === field.value?.value,
  );

  return (
    <Select
      value={selectedOption}
      onChange={option => {
        if (option) {
          field.onChange({
            value: option.value,
            showName: option.label,
          });
        } else {
          field.onChange({
            value: '',
            showName: '',
          });
        }
      }}
      options={options}
      isDisabled={disabled}
      placeholder={placeholder}
      className="w-full"
      classNamePrefix="react-select"
      isClearable={false}
      styles={createSelectStyles(!!error)}
    />
  );
};

/**
 * 动态表单字段组件
 */
const DynamicFormField = ({
  column,
  control,
  name,
  disabled = false,
}: {
  column: ColumnConfig;
  control: any;
  name: string;
  disabled?: boolean;
}) => {
  const renderField = (field: any, fieldState: any) => {
    const { error } = fieldState;
    const placeholder = `请输入${column.showName}`;

    switch (column.inputType) {
      case EnumInputType.TEXT:
        return (
          <TextInputField
            field={field}
            error={error}
            disabled={disabled}
            placeholder={placeholder}
          />
        );

      case EnumInputType.TEXTAREA:
        return (
          <TextareaField
            field={field}
            error={error}
            disabled={disabled}
            placeholder={placeholder}
          />
        );

      case EnumInputType.COMBO_BOX:
        return (
          <SelectField
            field={field}
            error={error}
            disabled={disabled}
            placeholder={`请选择${column.showName}`}
            enumValues={column.enumValues}
          />
        );

      case EnumInputType.DATE:
        return <DateField field={field} error={error} disabled={disabled} />;

      default:
        return (
          <TextInputField
            field={field}
            error={error}
            disabled={disabled}
            placeholder={placeholder}
          />
        );
    }
  };

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <div>
          {renderField(field, fieldState)}
          {fieldState.error && (
            <p className={STYLES.fieldError}>{fieldState.error.message}</p>
          )}
        </div>
      )}
    />
  );
};

// ==================== 字段配置 ====================

/**
 * 创建字段配置
 */
const createFieldConfigs = (): FieldConfig[] => [
  {
    columnCode: 'projectId',
    getDefaultValue: () => ({ value: '', showName: '' }),
    forceRequired: true,
  },
  {
    columnCode: 'content',
    getDefaultValue: ({ selectedTextInfo }) => ({
      value: selectedTextInfo?.text || '',
      showName: selectedTextInfo?.text || '',
    }),
    forceDisabled: true,
  },
  {
    columnCode: 'filePath',
    getDefaultValue: ({ selectedTextInfo }) => ({
      value: selectedTextInfo?.filePath || '',
      showName: selectedTextInfo?.filePath || '',
    }),
    forceDisabled: true,
  },
  {
    columnCode: 'lineRange',
    getDefaultValue: ({ selectedTextInfo }) => ({
      value: selectedTextInfo?.lineNumber || '',
      showName: selectedTextInfo?.lineNumber || '',
    }),
    forceDisabled: true,
  },
  {
    columnCode: 'gitRepositoryName',
    getDefaultValue: ({ gitInfo }) => ({
      value: gitInfo?.repositoryUrl || '',
      showName: gitInfo?.repositoryUrl || '',
    }),
    forceDisabled: true,
  },
  {
    columnCode: 'gitBranchName',
    getDefaultValue: ({ gitInfo }) => ({
      value: gitInfo?.branchName || '',
      showName: gitInfo?.branchName || '',
    }),
    forceDisabled: true,
  },
  {
    columnCode: 'source',
    getDefaultValue: () => ({ value: '7', showName: '开发人员识别' }),
  },
  {
    columnCode: 'type',
    getDefaultValue: () => ({ value: '2', showName: '建议' }),
  },
  {
    columnCode: 'priority',
    getDefaultValue: () => ({ value: '5', showName: 'P4' }),
  },
  {
    columnCode: 'reviewer',
    getDefaultValue: ({ userDetail }) => ({
      value: userDetail?.value || '',
      showName: userDetail?.showName || '',
    }),
  },
  {
    columnCode: 'assignConfirmer',
    getDefaultValue: ({ userDetail }) => ({
      value: userDetail?.value || '',
      showName: userDetail?.showName || '',
    }),
  },
];

// ==================== 验证逻辑 ====================

/**
 * 生成验证 schema
 */
const generateValidationSchema = (
  columns: ColumnConfig[],
  fieldConfigs: FieldConfig[],
) => {
  const schemaObject: any = {};

  columns.forEach(item => {
    const fieldConfig = fieldConfigs.find(
      config => config.columnCode === item.columnCode,
    );
    const isRequired = item.required || fieldConfig?.forceRequired;

    const base = yup.object().shape({
      value: yup.string().trim(),
      showName: yup.string().trim(),
    });

    schemaObject[item.columnCode] = isRequired
      ? base
          .required(`${item.showName} 是必填项`)
          .test('not-empty', `${item.showName} 是必填项`, value =>
            Boolean(value?.value && value.value.trim() !== ''),
          )
      : base.optional();
  });

  return yup.object().shape(schemaObject);
};

// ==================== 主组件 ====================

/**
 * 添加评审意见页面组件
 */
const AddReviewCommentPage = () => {
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [selectedTextInfo, setSelectedTextInfo] =
    useState<SelectedTextPayload | null>(null);
  const { loading: submitting, execute: submitReviewComment } =
    useAsyncAction();

  // 字段配置
  const fieldConfigs = useMemo(() => createFieldConfigs(), []);

  // 获取字段配置
  const getFieldConfig = useCallback(
    (columnCode: string): FieldConfig | undefined => {
      return fieldConfigs.find(config => config.columnCode === columnCode);
    },
    [fieldConfigs],
  );

  // 生成验证 schema
  const validationSchema = useMemo(
    () => generateValidationSchema(columns, fieldConfigs),
    [columns, fieldConfigs],
  );

  // 表单控制
  const {
    control,
    handleSubmit,
    reset,
    formState: { isValid },
  } = useForm<FormData>({
    resolver: yupResolver(validationSchema),
    mode: 'onChange',
  });

  /**
   * 获取字段默认值
   */
  const getFieldDefaultValue = useCallback(
    (column: ColumnConfig, context: EditorialContext): FormFieldValue => {
      const fieldConfig = getFieldConfig(column.columnCode);

      if (fieldConfig?.getDefaultValue) {
        return fieldConfig.getDefaultValue(context);
      }

      return { value: '', showName: '' };
    },
    [getFieldConfig],
  );

  /**
   * 处理初始化数据
   */
  const handleEditorialInit = useCallback(
    (message: ExtensionMessage<EditorialInitPayload>) => {
      const {
        selectedTextInfo,
        gitInfo,
        userDetail,
        columns = [],
      } = message.payload || {};

      // 保存选中的文本信息（包含fileSnapshot）
      setSelectedTextInfo(selectedTextInfo);

      // 只显示 showInAddPage 为 true 的字段
      const visibleColumns = columns.filter(column => column.showInAddPage);
      setColumns(visibleColumns);

      if (visibleColumns.length) {
        const initialData: FormData = {};
        visibleColumns.forEach(item => {
          const defaultValue = getFieldDefaultValue(item, {
            selectedTextInfo,
            gitInfo,
            userDetail,
          });
          initialData[item.columnCode] = defaultValue;
        });
        reset(initialData);
      }
    },
    [getFieldDefaultValue, reset],
  );

  /**
   * 提交表单
   */
  const onSubmit = async (data: FormData) => {
    const uniqueId = createUniqueId();

    const payload: Record<string, ReviewCommentItem> = {
      [uniqueId]: {
        id: uniqueId,
        dataVersion: 0,
        status: 0,
        latestOperateType: EnumCommentOperateType.Submit,
        values: {
          ...data,
          identifier: { value: uniqueId, showName: uniqueId },
          fileSnapshot: {
            value: selectedTextInfo?.fileSnapshot || '',
            showName: selectedTextInfo?.fileSnapshot || '',
          },
          reviewDate: {
            value: formatCurrentDateTime(),
            showName: formatCurrentDateTime(),
          },
          confirmResult: {
            value: EnumConfirmResult.Unconfirmed,
            showName: '未确认',
          },
        },
      },
    };

    await submitReviewComment(EnumMessageType.SaveReviewComment, {
      comment: payload,
    });
  };

  // 设置消息监听器
  useEffect(() => {
    onMessage<EditorialInitPayload>(
      EnumMessageType.EditorialInit,
      handleEditorialInit,
    );

    return () => {
      removeMessageHandler<EditorialInitPayload>(
        EnumMessageType.EditorialInit,
        handleEditorialInit,
      );
    };
  }, [handleEditorialInit]);

  // 加载状态
  if (!columns.length) {
    return (
      <div className={STYLES.errorContainer}>
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg
              className={STYLES.errorIcon}
              viewBox="0 0 20 20"
              fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className={STYLES.errorTitle}>列配置未加载</h3>
            <div className={STYLES.errorMessage}>
              请先在 CoReview 面板中加载数据，然后重新尝试添加评审意见
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={STYLES.container}>
      <form onSubmit={handleSubmit(onSubmit)} className={STYLES.form}>
        <div className={STYLES.formContent}>
          <div className={STYLES.formGrid}>
            {columns
              .sort((a, b) => a.sortIndex - b.sortIndex)
              .map(column => {
                const fieldConfig = getFieldConfig(column.columnCode);
                const isDisabled =
                  submitting ||
                  !column.editableInAddPage ||
                  fieldConfig?.forceDisabled;

                return (
                  <div key={column.id} className={STYLES.fieldContainer}>
                    <label className={STYLES.fieldLabel}>
                      {column.showName}
                      {column.required && (
                        <span className={STYLES.requiredMark}>*</span>
                      )}
                    </label>
                    <DynamicFormField
                      column={column}
                      control={control}
                      name={column.columnCode}
                      disabled={isDisabled}
                    />
                    {isDisabled && (
                      <p className={STYLES.fieldHelp}>
                        {fieldConfig?.forceDisabled
                          ? '此字段为系统自动填充，不可编辑'
                          : '此字段在新增页面中为只读状态'}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
        <div className={STYLES.formActions}>
          <button
            type="submit"
            className={`${STYLES.button} ${
              submitting || !columns.length || !isValid
                ? STYLES.buttonSecondary
                : STYLES.buttonPrimary
            }`}>
            {submitting ? '保存中...' : '保存评审意见'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddReviewCommentPage;
