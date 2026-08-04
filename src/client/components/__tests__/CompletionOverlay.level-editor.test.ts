import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const completionSource = readFileSync(
    join(process.cwd(), 'src/client/components/CompletionOverlay.svelte'),
    'utf8',
)
const editorSource = readFileSync(
    join(process.cwd(), 'src/client/components/LevelEditor.svelte'),
    'utf8',
)

describe('post-completion creator flow', () => {
    it('uses the Urjo design system instead of decorative glass UI', () => {
        expect(completionSource).toContain('bg-[#1C1C1E]')
        expect(completionSource).toContain('bg-[#2C2C2E]')
        expect(completionSource).toContain('bg-[#2563EB]')
        expect(completionSource).toContain('rounded-full')
        expect(completionSource).toContain('text-[3.5rem]')
        expect(completionSource).not.toContain('linear-gradient')
        expect(completionSource).not.toContain('blur-3xl')
        expect(completionSource).not.toContain('bg-white/[0.045]')
    })

    it('keeps progression, comments, and level publishing as separate actions', () => {
        expect(completionSource).toContain('Continue')
        expect(completionSource).toContain('Comment score')
        expect(completionSource).toContain('Create level')
        expect(completionSource).not.toContain('Comment &')
        expect(completionSource).not.toContain('Publish &')
    })

    it('keeps the result top-safe and orders growth actions before continuing', () => {
        expect(completionSource).toContain('pt-[max(1rem,env(safe-area-inset-top))]')
        expect(completionSource).toContain('items-center justify-start')
        expect(completionSource).not.toContain('items-center justify-center px-5 py-4')

        expect(completionSource).toContain('data-action-priority="comment-challenge-create-continue"')
        expect(completionSource).toMatch(/showCommentForm = true\)\} class="[^"]*bg-\[#2563EB\]/)
        expect(completionSource).toMatch(/onclick=\{onContinue\}[\s\S]*?bg-\[#3A3A3C\]/)
    })

    it('supports every playable board size', () => {
        expect(editorSource).toContain('[4, 6, 8]')
    })

    it('explains that publishing creates a Reddit post from the player account', () => {
        expect(editorSource).toContain('Creates a Reddit post from your account')
        expect(editorSource).toContain('Publish level')
    })
})
