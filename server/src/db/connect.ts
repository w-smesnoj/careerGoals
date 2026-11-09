import mongoose from 'mongoose'
import { env } from '../config/env'

export async function connectToDatabase(): Promise<void> {
  mongoose.set('strictQuery', true)

  mongoose.connection.on('connected', () => {
    console.log(`[db] connected to ${mongoose.connection.name}`)
  })
  mongoose.connection.on('error', (error) => {
    console.error('[db] connection error', error)
  })
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected')
  })

  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10_000 })
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.connection.close()
}
