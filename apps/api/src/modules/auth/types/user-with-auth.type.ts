import { Prisma } from '@prisma/client';

export const userWithAuthArgs = {
  include: {
    roles: {
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserDefaultArgs;

export type UserWithAuth = Prisma.UserGetPayload<typeof userWithAuthArgs>;
