import { connectToDatabase, disconnectFromDatabase } from './db/connect'
import { backupCollections } from './lib/backup'

async function main(): Promise<void> {
  await connectToDatabase()
  const dir = await backupCollections('manual')
  console.log(`[backup] done -> ${dir}`)
  await disconnectFromDatabase()
}

main().catch((error) => {
  console.error('[backup] failed', error)
  process.exit(1)
})
