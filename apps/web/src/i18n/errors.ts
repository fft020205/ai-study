import i18n from './index';
import {zhCN} from './zh-CN';

type ErrorKey = keyof typeof zhCN.errors;
const errorKeys = new Map<string, ErrorKey>(
  Object.entries(zhCN.errors).map(([key, message]) => [message, key as ErrorKey])
);

export function localizeError(value: unknown, fallback = 'errors.operationFailed'): string {
  const message = value instanceof Error ? value.message : typeof value === 'string' ? value : '';
  const key = errorKeys.get(message);
  if (key) return i18n.t(`errors.${key}`);
  return message || i18n.t(fallback);
}
