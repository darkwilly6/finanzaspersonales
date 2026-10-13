import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

interface BaseProps {
  label: string
  error?: string
  hint?: ReactNode
}

export const TextField = forwardRef<HTMLInputElement, BaseProps & InputHTMLAttributes<HTMLInputElement>>(
  function TextField({ label, error, hint, id, ...rest }, ref) {
    const auto = useId()
    const fieldId = id ?? auto
    const describedBy = [error ? `${fieldId}-err` : '', hint ? `${fieldId}-hint` : ''].filter(Boolean).join(' ') || undefined
    return (
      <div className="field">
        <label htmlFor={fieldId}>{label}</label>
        <input ref={ref} id={fieldId} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
        {hint && !error ? <p className="field-hint" id={`${fieldId}-hint`}>{hint}</p> : null}
        {error ? <p className="field-error" id={`${fieldId}-err`} role="alert">{error}</p> : null}
      </div>
    )
  },
)

export const SelectField = forwardRef<HTMLSelectElement, BaseProps & SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectField({ label, error, hint, id, children, ...rest }, ref) {
    const auto = useId()
    const fieldId = id ?? auto
    const describedBy = [error ? `${fieldId}-err` : '', hint ? `${fieldId}-hint` : ''].filter(Boolean).join(' ') || undefined
    return (
      <div className="field">
        <label htmlFor={fieldId}>{label}</label>
        <select ref={ref} id={fieldId} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest}>
          {children}
        </select>
        {hint && !error ? <p className="field-hint" id={`${fieldId}-hint`}>{hint}</p> : null}
        {error ? <p className="field-error" id={`${fieldId}-err`} role="alert">{error}</p> : null}
      </div>
    )
  },
)
