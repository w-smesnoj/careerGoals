import mongoose from 'mongoose'
import { connectToDatabase, disconnectFromDatabase } from './db/connect'
import { backupCollections } from './lib/backup'
import { migrations } from './migrations/registry'

interface MigrationRecord {
  _id: string
  description: string
  appliedAt: Date
}

async function migrate(): Promise<void> {
  await connectToDatabase()
  const db = mongoose.connection.db!
  const ledger = db.collection<MigrationRecord>('migrations')

  const appliedIds = new Set((await ledger.find({}).toArray()).map((record) => record._id))
  const pending = migrations.filter((migration) => !appliedIds.has(migration.id))

  if (pending.length === 0) {
    console.log('[migrate] database is up to date, nothing to run')
    await disconnectFromDatabase()
    return
  }

  console.log(`[migrate] ${pending.length} pending: ${pending.map((m) => m.id).join(', ')}`)
  // The database is the source of truth, so nothing here runs without an
  // undo path first.
  await backupCollections('pre-migrate')

  for (const migration of pending) {
    console.log(`[migrate] applying ${migration.id} - ${migration.description}`)
    await migration.up(db)
    await ledger.insertOne({
      _id: migration.id,
      description: migration.description,
      appliedAt: new Date(),
    })
    console.log(`[migrate] ${migration.id} applied`)
  }

  console.log('[migrate] done')
  await disconnectFromDatabase()
}

migrate().catch((error) => {
  console.error('[migrate] failed - remaining migrations were not applied', error)
  process.exit(1)
})
