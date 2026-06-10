import { Prisma } from '@prisma/client';

export const roleListArgs = {
  include: {
    permissions: {
      include: {
        permission: {
          select: {
            id: true,
            key: true,
            module: true,
            action: true,
            label: true,
          },
        },
      },
    },
    _count: {
      select: { users: true },
    },
  },
} satisfies Prisma.RoleDefaultArgs;

export type RoleListRow = Prisma.RoleGetPayload<typeof roleListArgs>;

export type PermissionItem = {
  id: string;
  key: string;
  module: string;
  action: string;
  label: string;
  description?: string | null;
};
