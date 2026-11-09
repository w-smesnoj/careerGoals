import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { EJSON } from 'bson'
import mongoose from 'mongoose'

const BACKUPS_ROOT = path.join(process.cwd(), 'server', 'backups')

/**
 * Dumps every collection (except the migration ledger) to Extended JSON files
 * under server/backups/<timestamp>-<label>/. This is the project's only
 * rollback mechanism: migrations don't ship a `down()`, they ship a backup
 * taken right before they run. EJSON (not plain JSON) round-trips ObjectId
 * and Date exactly, so `yarn db:restore` can put a document back unchanged.
 */
export async function backupCollections(label: string): Promise<string> {
  const db = mongoose.connection.db
  if (!db) throw new Error('backupCollections called before the database connected')

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(BACKUPS_ROOT, `${timestamp}-${label}`)
  await mkdir(dir, { recursive: true })

  const collections = await db.listCollections().toArray()

  for (const { name } of collections) {
    if (name === 'migrations') continue
    const docs = await db.collection(name).find({}).toArray()
    await writeFile(
      path.join(dir, `${name}.json`),
      EJSON.stringify(docs, { relaxed: false }, 2),
    )
    console.log(
      `[backup] ${name}: ${docs.length} document(s) -> ` +
        `${path.relative(process.cwd(), dir)}/${name}.json`,
    )
  }

  return dir
}
