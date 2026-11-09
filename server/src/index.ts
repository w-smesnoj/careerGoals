import { createApp } from './app'
import { env } from './config/env'
import { connectToDatabase, disconnectFromDatabase } from './db/connect'

async function bootstrap(): Promise<void> {
  await connectToDatabase()

  const server = createApp().listen(env.port, () => {
    console.log(`[api] listening on http://localhost:${env.port} (${env.nodeEnv})`)
  })

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} received, shutting down`)
    server.close()
    await disconnectFromDatabase()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

bootstrap().catch((error) => {
  console.error('[api] failed to start', error)
  process.exit(1)
})
