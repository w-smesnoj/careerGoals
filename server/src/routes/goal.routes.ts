import { Router } from 'express'
import {
  createGoal,
  deleteGoal,
  getGoal,
  listGoals,
  reorderGoals,
  updateGoal,
} from '../controllers/goal.controller'
import {
  deleteGoalResolution,
  getGoalResolution,
  setGoalResolution,
} from '../controllers/goalResolution.controller'

export const goalRouter = Router()

goalRouter.get('/', listGoals)
goalRouter.post('/', createGoal)
// Ahead of the /:id routes so "reorder" isn't captured as an id.
goalRouter.put('/reorder', reorderGoals)
goalRouter.get('/:id', getGoal)
goalRouter.patch('/:id', updateGoal)
goalRouter.delete('/:id', deleteGoal)

// Resolving a goal - the way a goal ends, in place of deleting it.
goalRouter.get('/:id/resolution', getGoalResolution)
goalRouter.put('/:id/resolution', setGoalResolution)
goalRouter.delete('/:id/resolution', deleteGoalResolution)
