import { Router } from 'express'
import {
  createThought,
  deleteThought,
  listThoughts,
  updateThought,
} from '../controllers/thought.controller'

export const thoughtRouter = Router()

thoughtRouter.get('/', listThoughts)
thoughtRouter.post('/', createThought)
thoughtRouter.patch('/:id', updateThought)
thoughtRouter.delete('/:id', deleteThought)
