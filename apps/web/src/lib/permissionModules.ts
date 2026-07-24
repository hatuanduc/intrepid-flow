export function moduleLabel(mod: string, t: (key: string) => string) {
  const key = `permissionModules.${mod}`;
  const label = t(key);
  return label === key ? mod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : label;
}

// Core permissions are seeded once (not user-editable text), so their label can be
// localized via i18n, keyed by module + action rather than the DB `label` value.
export function permissionLabel(p: { module: string; action: string; label: string }, t: (key: string) => string) {
  const key = `permissionLabels.${p.module}.${p.action}`;
  const label = t(key);
  return label === key ? p.label : label;
}
