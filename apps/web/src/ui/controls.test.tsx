import { render, screen } from '@testing-library/react';
import { Section } from './controls';

describe('Section', () => {
  it('does not color its heading with the page background', () => {
    render(<Section title="Password">content</Section>);
    // "base" is the background color token of this theme, so text-base would make the heading invisible.
    expect(screen.getByRole('heading', { name: 'Password' }).className).not.toMatch(/(^|\s)text-base(\s|$)/);
  });
});
