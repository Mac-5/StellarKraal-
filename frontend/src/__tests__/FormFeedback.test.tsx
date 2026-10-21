/**
 * Form field feedback — Issue #1417
 * Helper text, success state, character counts, and blur-triggered validation.
 */
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Input, Textarea, Select, CharCount } from '@/components/ui/FormField';
import {
  validateAppraisedValue,
  validateCollateralId,
  validateCount,
  validateLoanAmount,
} from '@/lib/loanFormValidation';

expect.extend(toHaveNoViolations);

describe('Input helper text', () => {
  it('renders helper text and links it with aria-describedby', () => {
    render(<Input label="Count" helperText="Whole number between 1 and 10,000." />);
    const input = screen.getByLabelText('Count');
    const helper = screen.getByText('Whole number between 1 and 10,000.');
    expect(input.getAttribute('aria-describedby')).toContain(helper.id);
  });

  it('keeps helper text visible alongside an error and describes both', () => {
    render(
      <Input label="Count" helperText="Whole number." error="Enter a count between 1 and 10,000." />
    );
    const input = screen.getByLabelText('Count');
    const ids = input.getAttribute('aria-describedby')!.split(' ');
    expect(ids).toHaveLength(2);
    expect(screen.getByText('Whole number.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a count between 1 and 10,000.');
  });

  it('merges a caller-provided aria-describedby', () => {
    render(<Input label="X" helperText="Hint" aria-describedby="extra" />);
    expect(screen.getByLabelText('X').getAttribute('aria-describedby')).toContain('extra');
  });
});

describe('Input success state', () => {
  it('shows the success border when success is set', () => {
    render(<Input label="Amount" success />);
    expect(screen.getByLabelText('Amount').className).toContain('border-success');
  });

  it('error wins over success', () => {
    render(<Input label="Amount" success error="Bad" />);
    const input = screen.getByLabelText('Amount');
    expect(input.className).toContain('border-error');
    expect(input.className).not.toContain('border-success');
  });
});

describe('Character count', () => {
  it('shows used / max for a field with a length limit', () => {
    render(<Input label="Name" maxLength={40} showCharCount value="Amina" onChange={() => {}} />);
    expect(screen.getByText(/5 \/ 40/)).toBeInTheDocument();
    const input = screen.getByLabelText('Name');
    expect(input.getAttribute('aria-describedby')).toContain(`${input.id}-count`);
  });

  it('updates as the user types in a textarea', () => {
    function Controlled() {
      const [v, setV] = useState('');
      return (
        <Textarea
          label="Notes"
          maxLength={10}
          showCharCount
          value={v}
          onChange={(e) => setV(e.target.value)}
        />
      );
    }
    render(<Controlled />);
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'hello' } });
    expect(screen.getByText(/5 \/ 10/)).toBeInTheDocument();
  });

  it('flags counts over the limit', () => {
    render(<CharCount length={45} max={40} />);
    expect(screen.getByText(/45 \/ 40/).className).toContain('text-error-dark');
  });

  it('is not shown without maxLength', () => {
    render(<Input label="Name" showCharCount value="abc" onChange={() => {}} />);
    expect(screen.queryByText(/\/ /)).toBeNull();
  });
});

describe('Select helper text', () => {
  it('renders and links helper text', () => {
    render(
      <Select label="Animal" helperText="Type of livestock.">
        <option>cattle</option>
      </Select>
    );
    const helper = screen.getByText('Type of livestock.');
    expect(screen.getByLabelText('Animal').getAttribute('aria-describedby')).toContain(helper.id);
  });
});

describe('a11y', () => {
  it('has no violations with helper, success and count', async () => {
    const { container } = render(
      <Input
        label="Name"
        helperText="Up to 40 characters."
        success
        maxLength={40}
        showCharCount
        value="Amina"
        onChange={() => {}}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Blur-triggered validation', () => {
  /** Minimal form using the same pattern as LoanForm: errors appear after blur. */
  function BlurForm() {
    const [value, setValue] = useState('');
    const [touched, setTouched] = useState(false);
    const error = touched ? (validateCount(value) ?? undefined) : undefined;
    return (
      <Input
        label="Count"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => setTouched(true)}
        error={error}
        success={touched && !error}
      />
    );
  }

  it('does not show an error while typing, only after blur', () => {
    render(<BlurForm />);
    const input = screen.getByLabelText('Count');
    fireEvent.change(input, { target: { value: '0' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.blur(input);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a count between 1 and 10,000.');
  });

  it('shows a success indicator after a valid blur', () => {
    render(<BlurForm />);
    const input = screen.getByLabelText('Count');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.blur(input);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input.className).toContain('border-success');
  });
});

describe('LoanForm validators give specific, actionable messages', () => {
  it('count', () => {
    expect(validateCount('')).toBe('Enter how many animals you are registering.');
    expect(validateCount('2.5')).toBe('Enter a whole number of animals (no decimals).');
    expect(validateCount('0')).toBe('Enter a count between 1 and 10,000.');
    expect(validateCount('10001')).toBe('Enter a count between 1 and 10,000.');
    expect(validateCount('5')).toBeNull();
  });

  it('appraised value', () => {
    expect(validateAppraisedValue('')).toMatch(/Enter the appraised value/);
    expect(validateAppraisedValue('1.5')).toMatch(/whole number of stroops/);
    expect(validateAppraisedValue('0')).toMatch(/greater than 0/);
    expect(validateAppraisedValue('1000')).toBeNull();
  });

  it('collateral id', () => {
    expect(validateCollateralId('')).toMatch(/Enter the collateral ID/);
    expect(validateCollateralId('-1')).toMatch(/positive whole number/);
    expect(validateCollateralId('42')).toBeNull();
  });

  it('loan amount', () => {
    expect(validateLoanAmount('')).toMatch(/how much you want to borrow/);
    expect(validateLoanAmount('999')).toBe('Enter a loan amount of at least 1,000 stroops.');
    expect(validateLoanAmount('1000')).toBeNull();
  });
});
