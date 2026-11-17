import { getPayload } from 'payload'
import config from '../src/payload.config'
import { seedNoriIfEmpty } from '../src/lib/seed-nori'

const payloadConfig = await config
const payload = await getPayload({ config: payloadConfig })
await seedNoriIfEmpty(payload)
const [models, vehicles, media] = await Promise.all([
  payload.count({ collection: 'vehicle-models', overrideAccess: true }),
  payload.count({ collection: 'vehicles', overrideAccess: true }),
  payload.count({ collection: 'media', overrideAccess: true }),
])
console.log('Seed verified:', {
  models: models.totalDocs,
  vehicles: vehicles.totalDocs,
  media: media.totalDocs,
})
process.exit(0)
