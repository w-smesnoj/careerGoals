import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useFabTrigger } from '../hooks/useFabAdd'
import { fade, springSnappy } from '../lib/motion'
import { PlusIcon } from './icons'

/**
 * Pages whose main thing to add is a new one of what they list. On Tracking this adds a unit; the quiet "+" on
 * each card logs a reading. On the calendar it opens the Special Days sheet.
 */
const ADDABLE_PATHS = new Set(['/', '/goals', '/calendar', '/think-tank', '/tracking'])

/** Glass condensing into a button: blurred and small on the way in, the same way out. */
const MATERIALIZE = { opacity: 0, scale: 0.6, filter: 'blur(6px)' }
const SOLID = { opacity: 1, scale: 1, filter: 'blur(0px)' }

/** A single circular add button, mounted once in the tab bar's trailing slot,
 *  that means something different on every page - it calls whatever the page
 *  in view registered. Where a page has nothing to add the slot stays empty,
 *  so the tabs never shift. */
export function FloatingAddButton() {
  const { pathname } = useLocation()
  const trigger = useFabTrigger()
  const reduceMotion = useReducedMotion()

  return (
    <AnimatePresence initial={false}>
      {ADDABLE_PATHS.has(pathname) && (
        <motion.div
          key="add"
          className="app-nav-add"
          initial={reduceMotion ? { opacity: 0 } : MATERIALIZE}
          animate={reduceMotion ? { opacity: 1 } : SOLID}
          exit={reduceMotion ? { opacity: 0 } : MATERIALIZE}
          transition={reduceMotion ? fade : springSnappy}
        >
          <button type="button" className="floating-add-button" onClick={trigger} aria-label="Add">
            <PlusIcon />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
