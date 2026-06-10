import { Prisma } from '@prisma/client';

export const userListArgs = {
  include: {
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
  },
} satisfies Prisma.UserDefaultArgs;

export type UserListRow = Prisma.UserGetPayload<typeof userListArgs>;
