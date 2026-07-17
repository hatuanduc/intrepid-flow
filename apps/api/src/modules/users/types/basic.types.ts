export type CreateUserInput = {
  email: string;
  name?: string;
  roleIds: number[];
  permissionIds?: number[];
};

export type UpdateUserInput = {
  name?: string;
  password?: string;
  isActive?: boolean;
  roleIds?: number[];
  permissionIds?: number[];
};

export type RoleSummary = {
  id: number;
  key: string;
  name: string;
};

export type PermissionSummary = {
  id: number;
  key: string;
  module: string;
  action: string;
  label: string;
};
