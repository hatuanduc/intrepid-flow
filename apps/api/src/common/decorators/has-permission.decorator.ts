import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';
// Accepts a single permission, or a list of permissions where any one grants access.
export const HasPermission = (permission: string | string[]) => SetMetadata(PERMISSION_KEY, permission);
