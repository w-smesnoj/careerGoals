import { Router } from 'express'
import {
  createTask,
  deleteTask,
  listTasks,
  reorderTasks,
  updateTask,
} from '../controllers/task.controller'
import { clearCompletion, setCompletion } from '../controllers/tracker.controller'

export const taskRouter = Router()

taskRouter.get('/', listTasks)
taskRouter.post('/', createTask)
// Ahead of the /:id routes so "reorder" isn't captured as an id.
taskRouter.put('/reorder', reorderTasks)
taskRouter.patch('/:id', updateTask)
taskRouter.delete('/:id', deleteTask)

// One day of one task: /api/tasks/:id/completions/2026-09-01
taskRouter.put('/:id/completions/:date', setCompletion)
taskRouter.delete('/:id/completions/:date', clearCompletion)
