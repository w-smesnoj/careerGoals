import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { isProduction } from '../config/env'

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` })
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    res.status(422).json({
      message: 'Validation failed',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
    return
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({ message: error.message })
    return
  }

  console.error('[error]', error)
  res.status(500).json({
    message: isProduction ? 'Internal server error' : String(error),
  })
}
