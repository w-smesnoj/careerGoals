import { Router } from 'express'
import {
  createSpecialDay,
  deleteSpecialDay,
  listSpecialDays,
  updateSpecialDay,
} from '../controllers/specialDay.controller'

export const specialDayRouter = Router()

specialDayRouter.get('/', listSpecialDays)
specialDayRouter.post('/', createSpecialDay)
specialDayRouter.patch('/:id', updateSpecialDay)
specialDayRouter.delete('/:id', deleteSpecialDay)
