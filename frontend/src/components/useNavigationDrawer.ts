import { type RefObject, useEffect } from 'react'

const focusableSelector = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function useNavigationDrawer(
  open: boolean,
  onClose: () => void,
  drawerRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLButtonElement | null>,
) {
  useEffect(() => {
    if (!open) return
    const drawer = drawerRef.current
    const trigger = triggerRef.current
    if (!drawer) return
    document.body.classList.add('mobile-nav-open')
    drawer.querySelector<HTMLElement>(focusableSelector)?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(focusableSelector))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.classList.remove('mobile-nav-open')
      document.removeEventListener('keydown', handleKeyDown)
      trigger?.focus()
    }
  }, [drawerRef, onClose, open, triggerRef])
}
