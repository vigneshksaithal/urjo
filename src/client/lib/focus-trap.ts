import type { Action } from 'svelte/action'

export type FocusTrapParams = {
    onClose: () => void
}

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))

export const focusTrap: Action<HTMLElement, FocusTrapParams> = (node, params) => {
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusFirst = (): void => {
        const elements = getFocusableElements(node)
        elements[0]?.focus()
    }

    const handleKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
            params.onClose()
            return
        }

        if (event.key !== 'Tab') return

        const elements = getFocusableElements(node)
        if (elements.length === 0) return

        const first = elements[0]
        const last = elements[elements.length - 1]

        if (event.shiftKey) {
            if (document.activeElement === first) {
                event.preventDefault()
                last?.focus()
            }
        } else {
            if (document.activeElement === last) {
                event.preventDefault()
                first?.focus()
            }
        }
    }

    focusFirst()
    node.addEventListener('keydown', handleKeydown)

    return {
        destroy(): void {
            node.removeEventListener('keydown', handleKeydown)
            previouslyFocused?.focus()
        },
    }
}
