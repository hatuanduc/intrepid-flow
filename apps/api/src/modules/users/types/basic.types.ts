export type CreateUserInput = {
  email: string;
  name: string;
  password: string;
  roleIds: string[];
};

export type UpdateUserInput = {
  name?: string;
  password?: string;
  isActive?: boolean;
  roleIds?: string[];
};

export type RoleSummary = {
  id: string;
  key: string;
  name: string;
};
