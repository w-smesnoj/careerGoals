import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { addCategory } from '../lib/categories'
import { CheckIcon, ChevronRightIcon, ChevronUpDownIcon } from './icons'

/*
 * The rows every editing sheet is built from - Settings' grouped lists, with
 * the phone's own controls inside them: native text fields with the right
 * keyboard, the system date picker, <select> as a pop-up button, the native
 * switch. No custom pickers anywhere: what the phone already does well, it
 * keeps doing.
 */

/** A grouped card of rows, with the small caps header above it and an
 *  explanatory footnote below - the shape of every Settings section. */
export function FormSection({
  header,
  footer,
  children,
}: {
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="form-section">
      {header && <h3 className="form-section-header">{header}</h3>}
      <div className="form-group">{children}</div>
      {footer && <p className="form-section-footer">{footer}</p>}
    </section>
  )
}

/** A label on the left, anything on the right - and, optionally, an icon tile before the label. */
export function FormRow({
  label,
  children,
  htmlFor,
  icon,
}: {
  label: ReactNode
  children?: ReactNode
  htmlFor?: string
  icon?: ReactNode
}) {
  return (
    <div className="form-row">
      {icon}
      {htmlFor ? (
        <label className="form-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="form-label">{label}</span>
      )}
      {children}
    </div>
  )
}

type InputMode = HTMLAttributes<HTMLInputElement>['inputMode']
type EnterKeyHint = HTMLAttributes<HTMLInputElement>['enterKeyHint']

/**
 * A text field. Without a label it takes the whole row, placeholder first -
 * the way Reminders asks for a title. With one, the label sits left and the
 * text right-aligned, as in Settings.
 */
export function TextFieldRow({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  maxLength,
  inputMode,
  enterKeyHint,
  autoCapitalize,
  required,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  maxLength?: number
  inputMode?: InputMode
  enterKeyHint?: EnterKeyHint
  autoCapitalize?: string
  required?: boolean
}) {
  const id = useId()
  const input = (
    <input
      id={id}
      className={label ? 'form-input form-input-trailing' : 'form-input'}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      data-autofocus={autoFocus || undefined}
      maxLength={maxLength}
      inputMode={inputMode}
      enterKeyHint={enterKeyHint}
      autoCapitalize={autoCapitalize}
      required={required}
      aria-label={label ? undefined : placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  )
  if (!label) return <div className="form-row form-row-field">{input}</div>
  return (
    <FormRow label={label} htmlFor={id}>
      {input}
    </FormRow>
  )
}

/** A field for a number, on the decimal keyboard. `type=text` so "75,5" is
 *  allowed through - lib/units' parseDecimal reads it. */
export function NumberRow({
  label,
  value,
  onChange,
  symbol,
  placeholder = '—',
  autoFocus,
  invalid,
  disabled,
  integer = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  symbol?: string
  placeholder?: string
  autoFocus?: boolean
  invalid?: boolean
  disabled?: boolean
  /** Whole numbers only - the plain number pad, no decimal key. */
  integer?: boolean
}) {
  const id = useId()
  return (
    <FormRow label={label} htmlFor={id}>
      <span className="form-number">
        <input
          id={id}
          className="form-input form-input-trailing"
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          enterKeyHint="done"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
      data-autofocus={autoFocus || undefined}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {symbol && <span className="form-symbol">{symbol}</span>}
      </span>
    </FormRow>
  )
}

/** Whether this engine sizes a textarea to its content in CSS alone. */
const sizesItself =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports('field-sizing', 'content')
    : false

/** A text area that grows with what's typed into it (`field-sizing`, with a
 *  measured fallback where that isn't supported yet). */
export function TextAreaRow({
  value,
  onChange,
  placeholder,
  autoFocus,
  maxLength,
  minRows = 3,
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  maxLength?: number
  minRows?: number
  label?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || sizesItself) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [value])

  return (
    <div className="form-row form-row-field">
      <textarea
        ref={ref}
        className="form-input form-textarea"
        rows={minRows}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
      data-autofocus={autoFocus || undefined}
        maxLength={maxLength}
        aria-label={label ?? placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

/** The native switch: `<input type=checkbox switch>` - iOS 17.4+ draws its
 *  own (with its haptic); elsewhere CSS draws the same shape. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  id?: string
}) {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      className="form-switch"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      {...({ switch: '' } as object)}
    />
  )
}

export function SwitchRow({
  label,
  subtitle,
  checked,
  onChange,
  disabled,
}: {
  label: string
  subtitle?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="form-row" data-disabled={disabled || undefined}>
      <label className="form-label form-label-stack" htmlFor={id}>
        <span>{label}</span>
        {subtitle && <span className="form-sublabel">{subtitle}</span>}
      </label>
      <Switch id={id} label={label} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}

/**
 * A date, with the system picker - the iOS wheel or calendar. `optional`
 * puts a switch beside it, as Reminders does for a due date: off means no
 * date at all.
 */
export function DateRow({
  label,
  value,
  onChange,
  min,
  max,
  optional,
  readOnly,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  /** Present for an optional date: whether it's set, and how to toggle it. */
  optional?: { enabled: boolean; onToggle: (enabled: boolean) => void }
  readOnly?: boolean
}) {
  const id = useId()
  const showInput = !optional || optional.enabled
  return (
    <FormRow label={label} htmlFor={showInput ? id : undefined}>
      <span className="form-date">
        {showInput &&
          (readOnly ? (
            <span className="form-value">{value}</span>
          ) : (
            <input
              id={id}
              className="form-date-input"
              type="date"
              value={value}
              min={min}
              max={max}
              required={!optional}
              onChange={(event) => onChange(event.target.value)}
            />
          ))}
        {optional && (
          <Switch label={label} checked={optional.enabled} onChange={optional.onToggle} />
        )}
      </span>
    </FormRow>
  )
}

/** A native <select> dressed as an iOS pop-up button: the value in grey, ⌃⌄ after it. */
export function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  icon,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  disabled?: boolean
  /** A tile for what's chosen, before the label. */
  icon?: ReactNode
}) {
  const id = useId()
  return (
    <FormRow label={label} htmlFor={id} icon={icon}>
      <span className="popup-button" data-disabled={disabled || undefined}>
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as T)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronUpDownIcon />
      </span>
    </FormRow>
  )
}

/** A row that leads somewhere - a pushed page in the sheet - with the current
 *  setting in grey before the chevron. */
export function NavRow({
  label,
  detail,
  onClick,
  icon,
  disabled,
}: {
  label: ReactNode
  detail?: ReactNode
  onClick: () => void
  icon?: ReactNode
  disabled?: boolean
}) {
  return (
    <button type="button" className="form-row form-row-button" onClick={onClick} disabled={disabled}>
      {icon}
      <span className="form-label">{label}</span>
      {detail !== undefined && <span className="form-detail">{detail}</span>}
      <span className="form-chevron" aria-hidden="true">
        <ChevronRightIcon />
      </span>
    </button>
  )
}

/** A row that's a button: the accent for an action, red for a destructive one. */
export function ButtonRow({
  label,
  onClick,
  tone = 'accent',
  disabled,
}: {
  label: ReactNode
  onClick: () => void
  tone?: 'accent' | 'destructive'
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="form-row form-row-button form-action"
      data-tone={tone}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  )
}

/**
 * A checkmark list over native radios (or checkboxes, with `multiple`): the
 * whole row is the target, the chosen one carries a check at its trailing
 * edge - how iOS lists a choice of one.
 */
export function ChoiceList<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string
  options: { value: T; label: ReactNode; hint?: ReactNode; disabled?: boolean }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={name} className="choice-list">
      {options.map((option) => (
        <label
          key={option.value}
          className="form-row choice-row"
          data-disabled={option.disabled || undefined}
        >
          <input
            type="radio"
            className="visually-hidden"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          <span className="form-label form-label-stack">
            <span>{option.label}</span>
            {option.hint && <span className="form-sublabel">{option.hint}</span>}
          </span>
          <span className="choice-check" aria-hidden="true">
            {value === option.value && <CheckIcon />}
          </span>
        </label>
      ))}
    </div>
  )
}

/** The same list for several picks at once - checkboxes under the checkmarks. */
export function MultiChoiceList({
  name,
  options,
  values,
  onToggle,
}: {
  name: string
  options: { value: string; label: ReactNode; hint?: ReactNode }[]
  values: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div role="group" aria-label={name} className="choice-list">
      {options.map((option) => {
        const checked = values.includes(option.value)
        return (
          <label key={option.value} className="form-row choice-row">
            <input
              type="checkbox"
              className="visually-hidden"
              checked={checked}
              onChange={() => onToggle(option.value)}
            />
            <span className="form-label form-label-stack">
              <span>{option.label}</span>
              {option.hint && <span className="form-sublabel">{option.hint}</span>}
            </span>
            <span className="choice-check" aria-hidden="true">
              {checked && <CheckIcon />}
            </span>
          </label>
        )
      })}
    </div>
  )
}

/**
 * Colour swatches over native radios - a goal's colour, or (`palette="hue"`)
 * a special-day category's.
 */
export function SwatchRow<T extends string>({
  label,
  options,
  value,
  onChange,
  palette = 'goal',
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  palette?: 'goal' | 'hue'
}) {
  const name = useId()
  return (
    <div className="form-row swatch-row" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label
          key={option.value}
          className="swatch"
          data-goal-color={palette === 'goal' ? option.value : undefined}
          data-hue={palette === 'hue' ? option.value : undefined}
          title={option.label}
        >
          <input
            type="radio"
            className="visually-hidden"
            name={name}
            value={option.value}
            checked={value === option.value}
            aria-label={option.label}
            onChange={() => onChange(option.value)}
          />
          <span className="swatch-dot" aria-hidden="true" />
        </label>
      ))}
    </div>
  )
}

/**
 * Chips plus a field: type a name and press Return (or a comma) to make it a
 * chip, Backspace in the empty field takes the last one back, and anything
 * still typed when the field loses focus is kept too. Suggestions come from a
 * native <datalist> - a shortcut to what's already in use, not a closed list.
 */
export function TokensRow({
  tokens,
  onChange,
  suggestions,
  placeholder,
  label,
}: {
  tokens: string[]
  onChange: (tokens: string[]) => void
  suggestions: string[]
  placeholder: string
  label: string
}) {
  const listId = useId()
  const [text, setText] = useState('')
  const offered = suggestions.filter(
    (suggestion) => !tokens.some((token) => token.toLowerCase() === suggestion.toLowerCase()),
  )

  function commit() {
    if (!text.trim()) return
    onChange(addCategory(tokens, text.replace(/^#/, '')))
    setText('')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Backspace' && text === '' && tokens.length > 0) {
      onChange(tokens.slice(0, -1))
    }
  }

  return (
    <div className="form-row tokens-row">
      {tokens.map((token) => (
        <span key={token} className="token">
          {token}
          <button
            type="button"
            className="token-remove"
            aria-label={`Remove ${token}`}
            onClick={() => onChange(tokens.filter((existing) => existing !== token))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="form-input tokens-input"
        aria-label={label}
        placeholder={tokens.length ? '' : placeholder}
        list={listId}
        value={text}
        enterKeyHint="done"
        autoCapitalize="none"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
      />
      <datalist id={listId}>
        {offered.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </div>
  )
}
