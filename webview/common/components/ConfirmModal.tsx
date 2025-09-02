import React from 'react';
import ReactModal from 'react-modal';
import { type ConfirmModalProps, EnumModalAction } from './ConfirmModal.types';

/**
 * 确认弹窗组件
 *
 * 用于显示重置或提交操作的确认弹窗，支持自定义操作类型和数据统计。
 */
const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  modalAction,
  editDataSize,
  addDataSize,
  onCancel,
  onConfirm,
}) => {
  // 渲染弹窗标题
  const renderModalTitle = () => {
    const title =
      modalAction === EnumModalAction.Reset ? '确认重置' : '确认提交';

    return (
      <div className="pb-2">
        <h3 className="m-0 text-base">{title}</h3>
      </div>
    );
  };

  // 渲染数据统计信息
  const renderDataStats = () => {
    // 构建完整的数据统计文案 - 使用数组统一管理所有文案部分
    const buildStatsText = () => {
      const parts: string[] = ['当前共有 '];

      // 添加数据统计部分
      const stats = [
        { count: editDataSize, label: '条已编辑数据' },
        { count: addDataSize, label: '条新增数据' },
      ]
        .filter(item => item.count > 0)
        .map(item => `${item.count} ${item.label}`)
        .join('、');

      parts.push(stats);
      parts.push('。');

      return parts.join('');
    };

    return (
      <p className="m-0 mb-1 text-sm opacity-80">
        <span className="font-semibold">{buildStatsText()}</span>
      </p>
    );
  };

  // 渲染操作说明
  const renderActionDescription = () => {
    if (modalAction === EnumModalAction.Reset) {
      return (
        <p className="m-0 text-sm opacity-80">
          重置操作将清空所有已编辑和新增的数据，此操作不可撤销。请仔细确认后再继续。
        </p>
      );
    }

    return (
      <p className="m-0 text-sm opacity-80">
        即将提交所有已编辑和新增的数据到服务器。请确认数据无误后继续。
      </p>
    );
  };

  // 渲染弹窗内容区域
  const renderModalContent = () => {
    return (
      <div className="flex-1">
        {renderDataStats()}
        {renderActionDescription()}
      </div>
    );
  };

  // 渲染弹窗底部按钮
  const renderModalFooter = () => {
    const confirmButtonText =
      modalAction === EnumModalAction.Reset ? '确认重置' : '确认提交';

    return (
      <div className="flex justify-end gap-2 pt-3">
        <button
          className="bg-grey-13 text-grey-5 hover:bg-grey-12 active:bg-grey-11 flex items-center gap-1.5 rounded-md border border-[var(--vscode-panel-border)] px-3 py-1.5 text-xs font-medium transition-colors"
          onClick={onCancel}>
          取消
        </button>
        <button
          className="bg-blue-6/20 text-blue-9 hover:bg-blue-6/30 flex items-center gap-1.5 rounded-md border border-[var(--vscode-panel-border)] px-3 py-1.5 text-xs font-medium transition-colors"
          onClick={onConfirm}>
          {confirmButtonText}
        </button>
      </div>
    );
  };

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onCancel}
      style={{
        overlay: {
          backgroundColor: 'rgba(0,0,0,0.4)',
        },
        content: {
          background: 'var(--vscode-editor-background)',
          color: 'var(--vscode-editor-foreground)',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
      ariaHideApp={true}
      shouldCloseOnEsc={true}
      shouldCloseOnOverlayClick={true}>
      {/* 头部 */}
      {renderModalTitle()}

      {/* 内容区域 */}
      {renderModalContent()}

      {/* 底部 */}
      {renderModalFooter()}
    </ReactModal>
  );
};

export default ConfirmModal;
