import mongoose from 'mongoose'

export type Db = NonNullable<typeof mongoose.connection.db>

export interface Migration {
  /** Unique and sortable - conventionally `NNNN_short_description`. */
  id: string
  description: string
  up: (db: Db) => Promise<void>
}
