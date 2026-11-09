import { Router } from 'express'
import {
  createTrackingUnit,
  deleteTrackingUnit,
  getTrackingUnitSeries,
  listTrackingUnits,
  reorderTrackingUnits,
  updateTrackingUnit,
} from '../controllers/trackingUnit.controller'

export const trackingUnitRouter = Router()

trackingUnitRouter.get('/', listTrackingUnits)
trackingUnitRouter.post('/', createTrackingUnit)
// Ahead of the /:id routes so "reorder" isn't captured as an id.
trackingUnitRouter.put('/reorder', reorderTrackingUnits)
// Per-day figures for the unit's chart, collapsed by its aggregation.
trackingUnitRouter.get('/:id/series', getTrackingUnitSeries)
trackingUnitRouter.patch('/:id', updateTrackingUnit)
// 409 rather than a cascade when anything still points at it.
trackingUnitRouter.delete('/:id', deleteTrackingUnit)
