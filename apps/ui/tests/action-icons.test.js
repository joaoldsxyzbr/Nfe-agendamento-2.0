import { describe, expect, it } from 'vitest';
import { actionIconMarkup } from '../src/ui/action-icons';
describe('fixed action icons', () => {
    it('renders accessible decorative SVGs for every action without external dependencies', () => {
        const actions = ['new', 'consult', 'view', 'print', 'download', 'zip', 'cancel', 'retry', 'import'];
        for (const name of actions) {
            const markup = actionIconMarkup(name);
            expect(markup).toContain('<svg class="action-icon"');
            expect(markup).toContain('aria-hidden="true"');
            expect(markup).toContain('stroke="currentColor"');
            expect(markup).toContain('</svg>');
            expect(markup).not.toContain('<script');
            expect(markup).not.toContain('src=');
        }
    });
});
