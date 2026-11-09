import { Router } from 'express'
import {
  createMeasurement,
  deleteMeasurement,
  listMeasurements,
  updateMeasurement,
} from '../controllers/measurement.controller'

export const measurementRouter = Router()

measurementRouter.get('/', listMeasurements)
measurementRouter.post('/', createMeasurement)
measurementRouter.patch('/:id', updateMeasurement)
measurementRouter.delete('/:id', deleteMeasurement)
