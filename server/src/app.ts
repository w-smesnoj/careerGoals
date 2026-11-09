import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { env } from './config/env'
import { goalRouter } from './routes/goal.routes'
import { taskRouter } from './routes/task.routes'
import { trackerRouter } from './routes/tracker.routes'
import { thoughtRouter } from './routes/thought.routes'
import { trackingUnitRouter } from './routes/trackingUnit.routes'
import { measurementRouter } from './routes/measurement.routes'
import { specialDayRouter } from './routes/specialDay.routes'
import { specialDayCategoryRouter } from './routes/specialDayCategory.routes'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'

export function createApp() {
  const app = express()

  app.use(cors({ origin: env.clientOrigin, credentials: true }))
  app.use(express.json())

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    })
  })

  app.use('/api/goals', goalRouter)
  app.use('/api/tasks', taskRouter)
  app.use('/api/tracker', trackerRouter)
  app.use('/api/thoughts', thoughtRouter)
  app.use('/api/tracking-units', trackingUnitRouter)
  app.use('/api/measurements', measurementRouter)
  app.use('/api/special-days', specialDayRouter)
  app.use('/api/special-day-categories', specialDayCategoryRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
