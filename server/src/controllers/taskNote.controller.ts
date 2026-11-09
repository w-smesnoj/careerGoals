import type { Request, Response } from 'express'
import { z } from 'zod'
import { TaskNoteModel } from '../models/taskNote.model'
import { TaskModel } from '../models/task.model'
import { HttpError } from '../middleware/errorHandler'
import { DAY_PATTERN } from '../lib/date'
import { requireObjectId } from './goal.controller'

const listQuerySchema = z.object({
  date: z.string().regex(DAY_PATTERN, 'date must be formatted as YYYY-MM-DD').optional(),
  /** Every note against any of one goal's tasks - what the goals screen rolls up. */
  goalId: z.string().optional(),
})

/** Unfiltered listing is bounded, so "all notes" can never become a huge response. */
const LIST_LIMIT = 1000

const createTaskNoteSchema = z.object({
  taskId: z.string().min(1, 'A note must belong to a task'),
  date: z.string().regex(DAY_PATTERN, 'date must be formatted as YYYY-MM-DD'),
  text: z.string().trim().min(1, 'Note text is required').max(2000),
})

const updateTaskNoteSchema = z.object({
  text: z.string().trim().min(1, 'Note text is required').max(2000),
})

async function requireTaskExists(taskId: string): Promise<void> {
  const exists = await TaskModel.exists({ _id: taskId })
  if (!exists) throw new HttpError(404, 'Task not found')
}

/**
 * Notes, oldest first. Narrowed by `date` (one day, for the day screen), by
 * `goalId` (every note under one goal, for the goals screen), or by neither -
 * in which case it's the lot, capped.
 */
export async function listTaskNotes(req: Request, res: Response): Promise<void> {
  const { date, goalId } = listQuerySchema.parse(req.query)

  let taskFilter = {}
  if (goalId) {
    const tasks = await TaskModel.find({ goalId: requireObjectId(goalId, 'goal id') }).select('_id')
    taskFilter = { taskId: { $in: tasks.map((task) => task._id) } }
  }

  const notes = await TaskNoteModel.find({ ...(date ? { date } : {}), ...taskFilter })
    .sort({ createdAt: 1 })
    .limit(LIST_LIMIT)

  res.json(notes)
}

export async function createTaskNote(req: Request, res: Response): Promise<void> {
  const payload = createTaskNoteSchema.parse(req.body)
  const taskId = requireObjectId(payload.taskId, 'task id')
  await requireTaskExists(taskId)

  const note = await TaskNoteModel.create({ ...payload, taskId })
  res.status(201).json(note)
}

export async function updateTaskNote(req: Request, res: Response): Promise<void> {
  const { text } = updateTaskNoteSchema.parse(req.body)
  const note = await TaskNoteModel.findByIdAndUpdate(
    requireObjectId(req.params.id, 'note id'),
    { text },
    { new: true, runValidators: true },
  )
  if (!note) throw new HttpError(404, 'Note not found')
  res.json(note)
}

export async function deleteTaskNote(req: Request, res: Response): Promise<void> {
  const note = await TaskNoteModel.findByIdAndDelete(requireObjectId(req.params.id, 'note id'))
  if (!note) throw new HttpError(404, 'Note not found')
  res.status(204).send()
}
