import { Prisma } from '@prisma/client';

export const userWithRolesArgs = {
  include: {
    roles: {
      include: {
        role: true,
      },
    },
  },
} satisfies Prisma.UserDefaultArgs;

export type UserWithRoles = Prisma.UserGetPayload<typeof userWithRolesArgs>;
