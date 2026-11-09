import { GoalModel } from './models/goal.model'
import { TaskModel } from './models/task.model'
import { CompletionModel } from './models/completion.model'
import { connectToDatabase, disconnectFromDatabase } from './db/connect'
import { backupCollections } from './lib/backup'
import { monthDays } from './lib/date'

function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, monthIndex - 1 + delta, 1))
  return shifted.toISOString().slice(0, 7)
}

const blueprint = [
  {
    goal: {
      title: 'Run a half marathon',
      description: 'Build up to 21km by December.',
      categories: ['health'],
      targetDate: new Date('2026-12-01'),
    },
    tasks: ['Run 5k', 'Stretch 10 minutes', 'Log the run'],
  },
  {
    goal: {
      title: 'Read 24 books this year',
      description: 'Two a month, fiction and non-fiction alternating.',
      categories: ['learning'],
      targetDate: new Date('2026-12-31'),
    },
    tasks: ['Read 20 pages', 'Write one note'],
  },
  {
    goal: {
      title: 'Ship the quarterly project',
      description: 'Plan it, build it, and get it reviewed before the deadline.',
      categories: ['work'],
      targetDate: new Date('2026-10-15'),
    },
    tasks: ['Commit something', 'Review one PR'],
  },
]

const failureReasons = [
  'Ran out of time in the evening.',
  'Travelling, no gear with me.',
  'Felt ill and skipped it.',
  'Work ran late.',
  'Just forgot.',
]

async function seed(): Promise<void> {
  await connectToDatabase()

  // The database is the source of truth. Seed inserts demo data into an
  // empty database - it never overwrites what's already there.
  const [goalsCount, tasksCount, completionsCount] = await Promise.all([
    GoalModel.countDocuments(),
    TaskModel.countDocuments(),
    CompletionModel.countDocuments(),
  ])
  const hasData = goalsCount + tasksCount + completionsCount > 0
  const force = process.argv.includes('--force')

  if (hasData && !force) {
    console.error(
      `[seed] refusing to run: found ${goalsCount} goal(s), ${tasksCount} task(s), ` +
        `${completionsCount} completion(s) already in the database.\n` +
        '[seed] only run this against an empty database. To wipe existing data and\n' +
        '[seed] reseed anyway, pass --force (a backup is taken first regardless).',
    )
    await disconnectFromDatabase()
    process.exit(1)
  }

  if (hasData) {
    await backupCollections('pre-seed-force')
    await Promise.all([
      CompletionModel.deleteMany({}),
      TaskModel.deleteMany({}),
      GoalModel.deleteMany({}),
    ])
  }

  const today = new Date().toISOString().slice(0, 10)
  const thisMonth = today.slice(0, 7)
  const lastMonth = shiftMonth(thisMonth, -1)

  // Seed the previous month too, so the month switcher has something to show
  // on day 1 of a new month.
  const days = [...monthDays(lastMonth), ...monthDays(thisMonth)].filter(
    (day) => day <= today,
  )
  const bornOn = new Date(`${lastMonth}-01T00:00:00.000Z`)

  let taskCount = 0
  let completionCount = 0

  for (const entry of blueprint) {
    const goal = await GoalModel.create(entry.goal)

    for (const title of entry.tasks) {
      const task = await TaskModel.create({ title, goalId: goal._id })
      // Backdate creation, or every seeded day would sit before the task existed
      // and render as untickable.
      await TaskModel.updateOne(
        { _id: task._id },
        { $set: { createdAt: bornOn } },
        { timestamps: false },
      )
      taskCount += 1

      // A plausible-looking streak so the grid isn't empty on first run.
      const answered = days
        .map((date) => ({ date, roll: Math.random() }))
        .filter((entry) => entry.roll > 0.25)
        .map(({ date, roll }) =>
          roll > 0.45
            ? { taskId: task._id, date, status: 'done' as const, note: '' }
            : {
                taskId: task._id,
                date,
                status: 'failed' as const,
                note: failureReasons[Math.floor(Math.random() * failureReasons.length)],
              },
        )

      if (answered.length > 0) {
        await CompletionModel.insertMany(answered)
        completionCount += answered.length
      }
    }
  }

  console.log(
    `[seed] ${blueprint.length} goals, ${taskCount} tasks, ${completionCount} day records ` +
      `across ${days.length} day(s) of ${lastMonth} and ${thisMonth}`,
  )
  await disconnectFromDatabase()
}

seed().catch((error) => {
  console.error('[seed] failed', error)
  process.exit(1)
})
