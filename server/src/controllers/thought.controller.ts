import type { Request, Response } from 'express'
import { z } from 'zod'
import { ThoughtModel, thoughtOutcomeKinds } from '../models/thought.model'
import { HttpError } from '../middleware/errorHandler'
import { requireObjectId } from './goal.controller'
import { escapeRegex } from '../lib/text'

/** Deduped case-insensitively, keeping the first casing sent. */
const tagsSchema = z
  .array(z.string().trim().min(1).max(60))
  .max(20)
  .transform((values) => {
    const seen = new Set<string>()
    return values.filter((value) => {
      const key = value.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })

const outcomeSchema = z.object({
  kind: z.enum(thoughtOutcomeKinds),
  id: z.string().min(1),
  title: z.string().trim().max(140).default(''),
  at: z.coerce.date(),
})

const createThoughtSchema = z.object({
  title: z.string().trim().max(140).optional(),
  text: z.string().trim().min(1, 'A thought needs some text').max(10000),
  // An empty list on create means "didn't say", so the schema default applies.
  tags: tagsSchema.optional().transform((values) => (values?.length ? values : undefined)),
  pinned: z.boolean().optional(),
  outcome: outcomeSchema.nullable().optional(),
})

const updateThoughtSchema = createThoughtSchema.partial().extend({
  // On edit an empty list is a real edit - the thought ends up with no tags.
  // Reusing create's transform dropped it, so removing the last tag silently
  // did nothing (the same fix goal.controller makes for categories).
  tags: tagsSchema.optional(),
})

const listQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).optional(),
})

/** Pinned first, then newest. `search` matches title, body or tag, as a substring. */
export async function listThoughts(req: Request, res: Response): Promise<void> {
  const { search, tag } = listQuerySchema.parse(req.query)
  const pattern = search ? new RegExp(escapeRegex(search), 'i') : null

  const thoughts = await ThoughtModel.find({
    ...(pattern ? { $or: [{ title: pattern }, { text: pattern }, { tags: pattern }] } : {}),
    ...(tag ? { tags: tag } : {}),
  }).sort({ pinned: -1, createdAt: -1 })

  res.json(thoughts)
}

export async function createThought(req: Request, res: Response): Promise<void> {
  const thought = await ThoughtModel.create(createThoughtSchema.parse(req.body))
  res.status(201).json(thought)
}

export async function updateThought(req: Request, res: Response): Promise<void> {
  const payload = updateThoughtSchema.parse(req.body)
  const thought = await ThoughtModel.findByIdAndUpdate(
    requireObjectId(req.params.id, 'thought id'),
    payload,
    { new: true, runValidators: true },
  )
  if (!thought) throw new HttpError(404, 'Thought not found')
  res.json(thought)
}

/** A thought owns no child documents, so this is the one place deletion is plain. */
export async function deleteThought(req: Request, res: Response): Promise<void> {
  const thought = await ThoughtModel.findByIdAndDelete(
    requireObjectId(req.params.id, 'thought id'),
  )
  if (!thought) throw new HttpError(404, 'Thought not found')
  res.status(204).send()
}
