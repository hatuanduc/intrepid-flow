export function moduleLabel(mod: string, t: (key: string) => string) {
  const key = `permissionModules.${mod}`;
  const label = t(key);
  return label === key ? mod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : label;
}
