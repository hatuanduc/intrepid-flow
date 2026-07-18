const SYSTEM_ROLE_KEYS = ['superadmin', 'admin', 'operator', 'viewer'];

// Core system roles are seeded once (not user-editable text), so their name/description
// can be localized via i18n. Custom roles are free text typed by an admin — shown as-is.
export function roleName(role: { key: string; name: string }, t: (key: string) => string): string {
  if (!SYSTEM_ROLE_KEYS.includes(role.key)) return role.name;
  const i18nKey = `systemRoles.${role.key}.name`;
  const label = t(i18nKey);
  return label === i18nKey ? role.name : label;
}

export function roleDescription(
  role: { key: string; description?: string | null },
  t: (key: string) => string,
): string | null | undefined {
  if (!SYSTEM_ROLE_KEYS.includes(role.key)) return role.description;
  const i18nKey = `systemRoles.${role.key}.description`;
  const label = t(i18nKey);
  return label === i18nKey ? role.description : label;
}
