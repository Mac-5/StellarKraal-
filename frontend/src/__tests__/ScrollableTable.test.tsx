/**
 * ScrollableTable — Issue #1415
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import ScrollableTable from '@/components/ScrollableTable';

expect.extend(toHaveNoViolations);

function setSize(
  el: HTMLElement,
  {
    scrollWidth,
    clientWidth,
    scrollLeft = 0,
  }: { scrollWidth: number; clientWidth: number; scrollLeft?: number }
) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
  Object.defineProperty(el, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: scrollLeft,
  });
}

function Table() {
  return (
    <ScrollableTable label="Loans table">
      <table>
        <tbody>
          <tr>
            <td>Cell</td>
          </tr>
        </tbody>
      </table>
    </ScrollableTable>
  );
}

describe('ScrollableTable', () => {
  it('renders a focusable, labelled scroll region', () => {
    render(<Table />);
    const region = screen.getByRole('region', { name: 'Loans table' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region.className).toContain('overflow-x-auto');
  });

  it('hides the swipe hint when the table fits', () => {
    render(<Table />);
    expect(screen.queryByText(/Swipe to see more/)).toBeNull();
  });

  it('shows the swipe hint when the table overflows, and hides it at the end', () => {
    render(<Table />);
    const region = screen.getByRole('region', { name: 'Loans table' });

    setSize(region, { scrollWidth: 800, clientWidth: 320 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.getByText(/Swipe to see more/)).toBeInTheDocument();
    expect(screen.getByTestId('scroll-fade')).toBeInTheDocument();

    setSize(region, { scrollWidth: 800, clientWidth: 320, scrollLeft: 480 });
    fireEvent.scroll(region);
    expect(screen.queryByText(/Swipe to see more/)).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Table />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
