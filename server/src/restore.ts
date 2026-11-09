import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { EJSON } from 'bson'
import mongoose from 'mongoose'
import { connectToDatabase, disconnectFromDatabase } from './db/connect'
import { backupCollections } from './lib/backup'

const BACKUPS_ROOT = path.join(process.cwd(), 'server', 'backups')

async function listBackups(): Promise<string[]> {
  const entries = await readdir(BACKUPS_ROOT).catch(() => [])
  return entries.sort().reverse()
}

async function main(): Promise<void> {
  const label = process.argv[2]

  if (!label) {
    const available = await listBackups()
    console.error('[restore] usage: yarn db:restore <backup-folder-name>')
    if (available.length > 0) {
      console.error('[restore] available backups (newest first):')
      for (const name of available) console.error(`  ${name}`)
    } else {
      console.error('[restore] no backups found in server/backups/')
    }
    process.exit(1)
  }

  const dir = path.join(BACKUPS_ROOT, label)
  const files = await readdir(dir).catch(() => null)
  if (!files) {
    console.error(`[restore] no backup at server/backups/${label}`)
    const available = await listBackups()
    if (available.length > 0) {
      console.error('[restore] available backups (newest first):')
      for (const name of available) console.error(`  ${name}`)
    }
    process.exit(1)
  }

  await connectToDatabase()

  // Restoring overwrites whatever is live right now, so it gets the same
  // safety net as everything else: back that up before touching it.
  await backupCollections('pre-restore')

  const db = mongoose.connection.db!
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const collectionName = file.replace(/\.json$/, '')
    const raw = await readFile(path.join(dir, file), 'utf-8')
    const docs = EJSON.parse(raw) as Record<string, unknown>[]

    await db.collection(collectionName).deleteMany({})
    if (docs.length > 0) await db.collection(collectionName).insertMany(docs)
    console.log(`[restore] ${collectionName}: restored ${docs.length} document(s)`)
  }

  console.log(`[restore] done - restored from server/backups/${label}`)
  await disconnectFromDatabase()
}

main().catch((error) => {
  console.error('[restore] failed', error)
  process.exit(1)
})
