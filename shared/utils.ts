/**
 * 跨端共享工具函数集合
 *
 * 提供在扩展端和 Webview 中都可以使用的通用工具函数。
 * 主要包含 ID 生成、时间戳转换等核心功能。
 */

/** 序列号计数器，用于确保同一毫秒内的ID递增 */
let sequenceCounter = 0;

/** 上次生成ID的时间戳，用于判断是否需要重置序列号 */
let lastTimestamp = 0;

/**
 * 时间戳转换函数
 *
 * 将标准时间戳转换为13位字符串格式，使用位运算优化性能。
 * 通过基准时间调整，确保转换结果始终为正数且递增。
 *
 * @param timestamp 标准时间戳（毫秒）
 * @returns 转换后的13位时间戳字符串
 */
export const transformTimestamp = (timestamp: number): string => {
  // 使用更小的基准时间，确保不会出现负数
  const baseTime = 1600000000000; // 2020-09-13 作为基准时间
  const adjustedTime = timestamp - baseTime; // 相对时间

  // 处理边界情况：如果时间戳小于基准时间，使用0
  if (adjustedTime < 0) {
    return '0000000000000';
  }

  // 使用更安全的转换方式，保留毫秒级精度
  const scaled = Math.floor(adjustedTime); // 保留毫秒级精度
  const result = (scaled % 10000000000000).toString(); // 取模确保13位

  return result.padStart(13, '0');
};

/**
 * 生成19位纯数字的唯一ID
 *
 * 格式：转换后时间戳(13位) + 序列号(6位)
 * 特点：严格递增、纯数字、高性能、无重复
 *
 * 执行流程：
 * 1. 获取当前时间戳
 * 2. 判断是否为同一毫秒，决定序列号处理策略
 * 3. 转换时间戳为13位字符串
 * 4. 生成6位序列号并拼接
 *
 * @returns 19位纯数字ID字符串
 */
export const createUniqueId = (): string => {
  // 时间戳经过位运算转换逻辑（保证递增）
  const timestamp = Date.now();

  // 序列号处理：如果是同一毫秒，递增序列号；否则重置序列号
  if (timestamp === lastTimestamp) {
    sequenceCounter++;
  } else {
    sequenceCounter = 0;
    lastTimestamp = timestamp;
  }

  const transformedTimestamp = transformTimestamp(timestamp);

  // 生成6位序列号，不使用随机数
  const sequenceNum = sequenceCounter.toString().padStart(6, '0');

  const result = transformedTimestamp + sequenceNum;

  return result;
};

/**
 * 重置ID生成器的序列号计数器
 *
 * 主要用于测试或特殊情况下的重置，清除内部状态。
 * 重置后，下一个生成的ID将从序列号0开始。
 */
export const resetIdGenerator = (): void => {
  sequenceCounter = 0;
  lastTimestamp = 0;
};
