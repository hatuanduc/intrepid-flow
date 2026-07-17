const MODULE_LABELS: Record<string, string> = {
  dashboard:      'Tổng quan',
  users:          'Người dùng',
  roles:          'Vai trò',
  permissions:    'Quyền hạn',
  bank_statement: 'Sao kê ngân hàng',
  report_ar:      'Báo cáo AR',
  system:         'Hệ thống',
};

export function moduleLabel(mod: string) {
  return MODULE_LABELS[mod] ?? mod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
