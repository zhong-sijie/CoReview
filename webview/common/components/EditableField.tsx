import React, { useEffect, useState } from 'react';
import { EnumInputType } from '@shared/enums';
import type { ColumnConfig, ReviewCommentItem } from '@shared/types';

/**
 * 可编辑单元格组件的入参类型
 *
 * 定义可编辑单元格组件所需的所有属性，包括数据、配置和回调函数。
 * 支持多种输入类型，包括文本、多行文本、日期、下拉选择等。
 */
interface Props {
  /** 单元格显示文本，支持字符串、数字或空值 */
  title: string | number | null | undefined;
  /** 列配置，包含输入类型、枚举值、编辑权限等配置信息 */
  col: ColumnConfig;
  /** 当前行数据，包含评审评论的完整信息 */
  row: ReviewCommentItem;
  /** 是否处于编辑模式，控制显示态和编辑态的切换 */
  isEditing: boolean;
  /** 触发进入编辑模式的回调函数 */
  onStartEdit: () => void;
  /** 触发退出编辑模式的回调函数（不一定提交数据） */
  onStopEdit: () => void;
  /**
   * 提交更新的回调函数
   * @param value 新的值（字符串格式）
   * @param row 行数据
   * @param col 列配置
   */
  onUpdate: (value: string, row: ReviewCommentItem, col: ColumnConfig) => void;
}

/**
 * 可编辑单元格组件
 *
 * 根据列配置动态渲染不同类型的编辑控件，支持显示态和编辑态的切换。
 * 在显示态下点击进入编辑态，编辑完成后提交或取消。
 *
 * 支持的输入类型：
 * - TEXT: 单行文本输入
 * - TEXTAREA: 多行文本输入
 * - DATE: 日期选择器
 * - COMBO_BOX: 下拉选择框
 */
const EditableField = (props: Props) => {
  // 解构入参，得到当前上下文信息与事件回调
  const { title, col, row, isEditing, onStartEdit, onStopEdit, onUpdate } =
    props;

  /**
   * 本地输入值状态
   *
   * 初始化为title值，避免受控/非受控组件切换问题。
   * 在title变化时同步更新，例如外部数据回填时。
   */
  const [value, setValue] = useState(title || '');

  /**
   * 同步外部传入的 title 到本地 value
   *
   * 当外部数据发生变化时，确保本地状态与外部数据保持一致。
   * 依赖：title
   */
  useEffect(() => {
    setValue(title || '');
  }, [title]);

  /**
   * 通用输入框变更处理
   *
   * 处理文本输入、多行文本、日期等输入控件的值变更。
   * 触发时仅更新本地value状态，不立即提交到父组件。
   */
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    setValue(e.target.value);
  };

  /**
   * 提交当前编辑结果
   *
   * 比较当前值与原始值，如果发生变化则调用onUpdate向父级同步。
   * 无论是否变化，都会调用onStopEdit结束编辑态。
   */
  const handleCommit = () => {
    if (value !== title) {
      onUpdate(String(value), row, col);
    }
    onStopEdit();
  };

  /**
   * 键盘交互处理
   *
   * 提供键盘快捷键支持，提升用户体验。
   * - Enter: 提交当前编辑结果
   * - Escape: 撤销当前修改并退出编辑态
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        handleCommit();
        break;

      case 'Escape':
        setValue(title || '');
        onStopEdit();
        break;

      default:
        break;
    }
  };

  /**
   * 下拉选择变更处理
   *
   * 处理下拉选择框的值变更，采用即选即改模式。
   * 更新本地值并立即向上提交，无需等待失焦或回车。
   */
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onUpdate(newValue, row, col);
  };

  /**
   * 渲染编辑态控件
   *
   * 根据列配置的inputType渲染不同类型的输入控件。
   * 所有控件都使用统一的样式类名，确保与VS Code主题一致。
   */
  const renderEditComponent = () => {
    // 统一的样式类名，保证与 VS Code Webview 主题一致
    const commonClassName =
      'w-full px-2 py-1 text-sm border border-[var(--vscode-focusBorder)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] rounded focus:outline-none';

    switch (col.inputType) {
      case EnumInputType.TEXT:
      case EnumInputType.TEXTAREA:
        // 文本/多行文本：使用 input 做受控输入
        return (
          <input
            value={value as string}
            onChange={handleChange}
            onBlur={handleCommit}
            onKeyDown={handleKeyDown}
            autoFocus
            className={commonClassName}
          />
        );

      case EnumInputType.DATE:
        // 日期选择：原生 date 输入
        return (
          <input
            type="date"
            value={value as string}
            onChange={handleChange}
            onBlur={handleCommit}
            onKeyDown={handleKeyDown}
            autoFocus
            className={commonClassName}
          />
        );

      case EnumInputType.COMBO_BOX: {
        // 下拉选择：使用列配置中的枚举值渲染 options
        const currentOptions = col.enumValues || [];

        return (
          <select
            value={value as string}
            onChange={handleSelectChange}
            onBlur={handleCommit}
            onKeyDown={handleKeyDown}
            autoFocus
            className={commonClassName}>
            {currentOptions.map(option => (
              <option key={option.showName} value={option.showName}>
                {option.showName}
              </option>
            ))}
          </select>
        );
      }

      default:
        // 未支持类型：不渲染编辑控件
        return null;
    }
  };

  /**
   * 渲染显示态组件
   *
   * 根据列的可编辑配置决定渲染可点击的div还是只读的span。
   * 可编辑的单元格在hover时会显示高亮效果。
   */
  const renderDisplayComponent = () => {
    // 列是否在编辑页允许编辑，且 inputType 是受支持类型
    const isEditable =
      col.editableInEditPage &&
      Object.values(EnumInputType).includes(col.inputType);

    if (isEditable) {
      // 可编辑显示：hover 高亮，点击进入编辑
      const displayClassName =
        'w-full px-2 py-1 cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] rounded';

      return (
        <div className={displayClassName} onClick={onStartEdit}>
          {value}
        </div>
      );
    }

    // 非可编辑：只读显示
    return <span className="px-2 py-1 text-sm">{value || ''}</span>;
  };

  // 根据 isEditing 切换编辑态/显示态渲染
  if (isEditing) {
    return renderEditComponent();
  }

  return renderDisplayComponent();
};

export default EditableField;
