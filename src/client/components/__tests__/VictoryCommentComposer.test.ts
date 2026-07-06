import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const composerPath = join(
	process.cwd(),
	'src/client/components/VictoryCommentComposer.svelte',
)

const composerSource = readFileSync(composerPath, 'utf-8')

describe('VictoryCommentComposer.svelte', () => {
	it('renders as a fullscreen composer with a comment box and submit bar', () => {
		expect(composerSource).toContain('fixed inset-0 z-[60]')
		expect(composerSource).toContain('COMMENT')
		expect(composerSource).toContain('Write a comment!')
		expect(composerSource).toContain('{charCount}/400')
		expect(composerSource).toContain('Added automatically:')
		expect(composerSource).toContain('SUBMIT')
		expect(composerSource).toContain('onClose')
		expect(composerSource).toContain('onSubmit')
		expect(composerSource).toContain('textarea')
	})

	it('clears the draft comment via an effect keyed on isOpen', () => {
		// Without this, reopening the composer (e.g. after closing without
		// submitting, or after a successful post) would show leftover text
		// from the previous open.
		expect(composerSource).toMatch(
			/\$effect\(\(\) => \{\s*if \(isOpen\) \{\s*commentMessage = "";/,
		)
	})
})
