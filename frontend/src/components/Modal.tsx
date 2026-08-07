import { X } from '@phosphor-icons/react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Button, CardHeader } from './UI'

/** Kept in step with the exit animation on .modal-backdrop.is-closing. */
const EXIT_MS = 180

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function Modal({
  title,
  children,
  onClose,
  closeLabel,
  wide = false,
}: {
  title: string
  /**
   * Pass a function to receive the animated dismiss: any control inside the
   * dialog that closes it should call that instead of the raw onClose, so the
   * card plays its exit rather than vanishing mid-frame.
   */
  children: ReactNode | ((close: () => void) => ReactNode)
  onClose: () => void
  closeLabel: string
  wide?: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const exitTimer = useRef<number>()

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    if (prefersReducedMotion()) {
      onClose()
      return
    }
    setClosing(true)
    exitTimer.current = window.setTimeout(onClose, EXIT_MS)
  }, [onClose])

  useEffect(() => () => window.clearTimeout(exitTimer.current), [])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const focusable = dialog?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    focusable?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose()
      if (event.key !== 'Tab' || !dialog) return
      const elements = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (!elements.length) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('modal-open')
      previous?.focus()
    }
  }, [requestClose])

  return (
    <div
      className={`modal-backdrop ${closing ? 'is-closing' : ''}`}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && requestClose()}
    >
      <div
        ref={dialogRef}
        className={`modal-card ${wide ? 'modal-card-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <CardHeader
          className="modal-header"
          title={title}
          titleId="modal-title"
          trailing={<Button variant="ghost" size="small" className="icon-button" onClick={requestClose} aria-label={closeLabel}><X size={20} /></Button>}
        />
        {typeof children === 'function' ? children(requestClose) : children}
      </div>
    </div>
  )
}
