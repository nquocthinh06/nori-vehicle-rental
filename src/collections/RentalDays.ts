import type { CollectionConfig } from 'payload'

export const RentalDays: CollectionConfig = {
  slug: 'rental-days',
  admin: { hidden: true },
  access: { create: () => false, read: () => true, update: () => false, delete: () => false },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true, index: true },
    { name: 'vehicle', type: 'relationship', relationTo: 'vehicles', required: true, index: true },
    { name: 'day', type: 'text', required: true },
    {
      name: 'bookingKey',
      type: 'text',
      required: true,
      index: true,
      access: { read: () => false },
    },
    {
      name: 'lockType',
      type: 'select',
      options: ['BOOKING', 'TRANSFER', 'MAINTENANCE', 'PREPARATION'],
      defaultValue: 'BOOKING',
      index: true,
    },
    { name: 'referenceId', type: 'text', index: true, access: { read: () => false } },
    { name: 'branchId', type: 'text', index: true },
  ],
  versions: false,
}
