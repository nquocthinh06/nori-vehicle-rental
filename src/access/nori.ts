import type { Access, FieldAccess } from 'payload'

export const isAdmin: Access = ({ req }) => req.user?.collection === 'admins'
export const adminField: FieldAccess = ({ req }) => req.user?.collection === 'admins'
export const serverField: FieldAccess = () => false

export const ownAccount: Access = ({ req }) => {
  if (req.user?.collection === 'admins') return true
  if (req.user?.collection !== 'users' || req.user.status !== 'ACTIVE') return false
  return { id: { equals: req.user.id } }
}

export const ownRecords: Access = ({ req }) => {
  if (req.user?.collection === 'admins') return true
  if (req.user?.collection !== 'users' || req.user.status !== 'ACTIVE') return false
  return { customer: { equals: req.user.id } }
}

export const customerOnly: Access = ({ req }) =>
  req.user?.collection === 'users' && req.user.status === 'ACTIVE'
