/**
 * 弹窗操作类型枚举
 *
 * 定义确认弹窗支持的操作类型，用于区分重置和提交操作。
 */
export enum EnumModalAction {
  /** 重置操作 */
  Reset = 'reset',
  /** 提交操作 */
  Submit = 'submit',
}

/**
 * 确认弹窗组件的属性接口
 */
export interface ConfirmModalProps {
  /** 是否显示弹窗 */
  isOpen: boolean;
  /** 弹窗操作类型 */
  modalAction: EnumModalAction;
  /** 已编辑数据数量 */
  editDataSize: number;
  /** 新增数据数量 */
  addDataSize: number;
  /** 取消操作的回调函数 */
  onCancel: () => void;
  /** 确认操作的回调函数 */
  onConfirm: () => void;
}
