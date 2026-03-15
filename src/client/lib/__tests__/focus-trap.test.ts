// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { focusTrap } from '../focus-trap'

const makeContainer = (...tagNames: string[]): HTMLElement => {
    const container = document.createElement('div')
    for (const tag of tagNames) {
        const el = document.createElement(tag)
        if (tag === 'button') {
            container.appendChild(el)
        } else if (tag === 'a') {
            ; (el as HTMLAnchorElement).href = '#'
            container.appendChild(el)
        } else {
            container.appendChild(el)
        }
    }
    document.body.appendChild(container)
    return container
}

const tab = (shiftKey = false): KeyboardEvent =>
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true })

const esc = (): KeyboardEvent =>
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })

beforeEach(() => {
    document.body.innerHTML = ''
})

describe('focusTrap', () => {
    it('moves focus to the first focusable element on mount', () => {
        const container = makeContainer('button', 'button')
        const buttons = container.querySelectorAll('button')
        const onClose = vi.fn()

        focusTrap(container, { onClose })

        expect(document.activeElement).toBe(buttons[0])
    })

    it('Tab key cycles focus to the next focusable element', () => {
        const container = makeContainer('button', 'button', 'button')
        const buttons = Array.from(container.querySelectorAll('button'))
        const onClose = vi.fn()

        focusTrap(container, { onClose })

        // Focus is on first button; Tab from last should wrap to first
        buttons[2]?.focus()
        container.dispatchEvent(tab())

        expect(document.activeElement).toBe(buttons[0])
    })

    it('Shift+Tab cycles focus to the previous focusable element', () => {
        const container = makeContainer('button', 'button', 'button')
        const buttons = Array.from(container.querySelectorAll('button'))
        const onClose = vi.fn()

        focusTrap(container, { onClose })

        // Focus is on first button; Shift+Tab should wrap to last
        buttons[0]?.focus()
        container.dispatchEvent(tab(true))

        expect(document.activeElement).toBe(buttons[2])
    })

    it('Escape key calls the onClose callback', () => {
        const container = makeContainer('button')
        const onClose = vi.fn()

        focusTrap(container, { onClose })
        container.dispatchEvent(esc())

        expect(onClose).toHaveBeenCalledOnce()
    })

    it('restores focus to the previously focused element on destroy', () => {
        const trigger = document.createElement('button')
        document.body.appendChild(trigger)
        trigger.focus()

        const container = makeContainer('button', 'button')
        const onClose = vi.fn()

        const action = focusTrap(container, { onClose })
        expect(document.activeElement).not.toBe(trigger)

        action?.destroy?.()
        expect(document.activeElement).toBe(trigger)
    })
})
