import type { components } from '@/api/client';

export type Role = components['schemas']['User']['role'];

export const ROLES: readonly Role[] = ['member', 'admin'];

export const ROLE_LABELS: Record<Role, string> = {
  member: 'Member',
  admin: 'Administrator',
};
