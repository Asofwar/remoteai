import { expect, it } from 'vitest';
import { toolText } from './toolText';

it('keeps reasoning summaries and separate body paragraphs together', () => {
  expect(toolText({ id: 'reason', type: 'reasoning', summary: ['Summary one', 'Summary two'],
    content: ['Detailed explanation', 'Further reasoning'] }))
    .toBe('Summary one\n\nSummary two\n\nDetailed explanation\nFurther reasoning');
});

it('does not repeat identical summaries and preserves a streamed reasoning body', () => {
  expect(toolText({ id: 'reason', type: 'reasoning', summary: ['Same'], text: 'Same' })).toBe('Same');
  expect(toolText({ id: 'reason', type: 'reasoning', summary: ['Summary'], text: 'Live body' }))
    .toBe('Summary\n\nLive body');
});

it('keeps ordinary message source literal and retains review-only results', () => {
  const text = '# User text\n\n- [x] literal input';
  expect(toolText({ id: 'user', type: 'userMessage', content: [{ type: 'text', text }] })).toBe(text);
  expect(toolText({ id: 'review', type: 'exitedReviewMode', review: 'Review findings' })).toBe('Review findings');
});
