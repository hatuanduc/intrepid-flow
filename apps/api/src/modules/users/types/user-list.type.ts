import { Prisma } from '@prisma/client';

export const userListArgs = {
  select: {
    id: true,
    email: true,
    name: true,
    isActive: true,
    hasPassword: true,
    lastLoginAt: true,
    roles: {
      include: {
        role: {
          select: {
            id: true,
            key: true,
            name: true,
          },
        },
      },
    },
    permissions: {
      include: {
        permission: true,
      },
    },
  },
} satisfies Prisma.UserDefaultArgs;

export type UserListRow = Prisma.UserGetPayload<typeof userListArgs>;
