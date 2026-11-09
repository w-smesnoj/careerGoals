import { Router } from 'express'
import { getDay, getTracker } from '../controllers/tracker.controller'
import {
  createTaskNote,
  deleteTaskNote,
  listTaskNotes,
  updateTaskNote,
} from '../controllers/taskNote.controller'

export const trackerRouter = Router()

trackerRouter.get('/', getTracker)
trackerRouter.get('/day', getDay)

trackerRouter.get('/notes', listTaskNotes)
trackerRouter.post('/notes', createTaskNote)
trackerRouter.patch('/notes/:id', updateTaskNote)
trackerRouter.delete('/notes/:id', deleteTaskNote)
