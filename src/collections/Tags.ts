import type { CollectionConfig } from 'payload'
import { adminHasAnyPermission, adminMediaDeleteAccess, adminMediaWriteAccess } from '@/access/nori'

export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: {
    useAsTitle: 'name',
  },
  access: {
    create: ({ req }) => adminMediaWriteAccess(req),
    read: ({ req }) =>
      adminHasAnyPermission(req.user, [
        ['vehicles', 'read'],
        ['models', 'read'],
        ['posts', 'read'],
        ['content', 'read'],
      ]),
    update: ({ req }) => adminMediaWriteAccess(req),
    delete: ({ req }) => adminMediaDeleteAccess(req),
  },
  tags: true,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
  ],
}
