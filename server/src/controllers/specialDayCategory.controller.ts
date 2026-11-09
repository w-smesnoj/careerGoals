import type { Request, Response } from 'express'
import { z } from 'zod'
import {
  SpecialDayCategoryModel,
  specialDayHues,
  specialDayIcons,
} from '../models/specialDayCategory.model'
import { SpecialDayModel } from '../models/specialDay.model'
import { HttpError } from '../middleware/errorHandler'
import { requireObjectId } from './goal.controller'
import { withdrawAutoFailsOn } from './specialDay.controller'

const categoryShape = z.object({
  name: z.string().trim().min(1, 'A category needs a name').max(40),
  color: z.enum(specialDayHues),
  icon: z.enum(specialDayIcons),
  dayOff: z.boolean().optional(),
  pausesHabits: z.boolean().optional(),
})

const createCategorySchema = categoryShape
// `builtin` is never accepted: which categories the computed days land in is
// settled by the migration that made them, not by an edit.
const updateCategorySchema = categoryShape.partial()

/** Names are what the filter shows, so two that read the same would be one chip twice. */
async function requireUniqueName(name: string, exceptId?: string): Promise<void> {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const clash = await SpecialDayCategoryModel.findOne({
    name: { $regex: `^${escaped}$`, $options: 'i' },
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  })
  if (clash) throw new HttpError(409, `There's already a category called ${clash.name}`)
}

/** In filter order: the built-ins where the migration put them, new ones after. */
export async function listSpecialDayCategories(_req: Request, res: Response): Promise<void> {
  const categories = await SpecialDayCategoryModel.find().sort({ order: 1, createdAt: 1 })
  res.json(categories)
}

export async function createSpecialDayCategory(req: Request, res: Response): Promise<void> {
  const payload = createCategorySchema.parse(req.body)
  await requireUniqueName(payload.name)

  const last = await SpecialDayCategoryModel.findOne().sort({ order: -1 }).select('order')
  const category = await SpecialDayCategoryModel.create({
    ...payload,
    order: (last?.order ?? -1) + 1,
  })
  res.status(201).json(category)
}

export async function updateSpecialDayCategory(req: Request, res: Response): Promise<void> {
  const payload = updateCategorySchema.parse(req.body)
  const id = requireObjectId(req.params.id, 'category id')

  const current = await SpecialDayCategoryModel.findById(id)
  if (!current) throw new HttpError(404, 'Category not found')
  if (payload.name !== undefined) await requireUniqueName(payload.name, id)

  const startsPausing = payload.pausesHabits === true && !current.pausesHabits
  current.set(payload)
  await current.save()

  // The same catch-up a newly entered vacation does, for every day the
  // category already holds: their automatic fails predate the pause.
  if (startsPausing) {
    await withdrawAutoFailsOn(await SpecialDayModel.find({ categoryId: id }).select('startDate endDate'))
  }

  res.json(current)
}

/**
 * Takes its days with it, the way deleting a calendar takes its events - the
 * client says how many before asking. A built-in one can't go: the holidays
 * computed into it would have nowhere to land.
 */
export async function deleteSpecialDayCategory(req: Request, res: Response): Promise<void> {
  const id = requireObjectId(req.params.id, 'category id')
  const category = await SpecialDayCategoryModel.findById(id)
  if (!category) throw new HttpError(404, 'Category not found')
  if (category.builtin) {
    throw new HttpError(400, `${category.name} holds your region's computed days and can't be deleted`)
  }

  await SpecialDayModel.deleteMany({ categoryId: id })
  await category.deleteOne()
  res.status(204).send()
}
