const ACCOUNT_CONTROL_SELECTOR = [
  "button", "a", "input", "textarea", "select", "label", "summary", "details",
  '[role="button"]', '[role="checkbox"]', '[role="combobox"]', '[role="switch"]',
  '[contenteditable="true"]',
  ".ant-input-number", ".ant-input-number-affix-wrapper",
  ".ant-select", ".ant-dropdown", ".ant-popover", ".ant-popconfirm",
  ".ant-table-selection-column", ".ant-table-row-expand-icon-cell", ".account-actions-column",
].join(", ");

export function isAccountControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(ACCOUNT_CONTROL_SELECTOR) !== null;
}
