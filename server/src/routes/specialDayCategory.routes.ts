import { Router } from 'express'
import {
  createSpecialDayCategory,
  deleteSpecialDayCategory,
  listSpecialDayCategories,
  updateSpecialDayCategory,
} from '../controllers/specialDayCategory.controller'

export const specialDayCategoryRouter = Router()

specialDayCategoryRouter.get('/', listSpecialDayCategories)
specialDayCategoryRouter.post('/', createSpecialDayCategory)
specialDayCategoryRouter.patch('/:id', updateSpecialDayCategory)
specialDayCategoryRouter.delete('/:id', deleteSpecialDayCategory)
