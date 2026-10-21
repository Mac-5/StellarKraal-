'use client';
import { useWizard } from '@/context/LoanWizardContext';
import { GlossaryTerm } from '@/components/GlossaryTerm';
import FieldTooltip from '@/components/FieldTooltip';
import { Button } from '@/components/ui';
import { formatXlmFromStroops } from '@/lib/formatMoney';
import { WIZARD_FIELD_TOOLTIPS } from '@/lib/wizardFieldTooltips';
import NumericInput from '@/components/NumericInput';

const TERM_OPTIONS = [
  { days: '7', label: '7 days', rate: '2%' },
  { days: '30', label: '30 days', rate: '5%' },
  { days: '90', label: '90 days', rate: '12%' },
  { days: '180', label: '180 days', rate: '20%' },
];

export default function StepAmount() {
  const { loanAmount, loanTermDays, appraisedValue, error, setField, nextStep, prevStep } =
    useWizard();

  const maxLoan = appraisedValue ? Math.floor(parseInt(appraisedValue) * 0.7) : 0; // 70% LTV
  // Round LTV to 2 decimal places to avoid floating-point artefacts like 74.99999999%
  const ltvRaw =
    loanAmount && maxLoan ? (parseInt(loanAmount) / parseInt(appraisedValue)) * 100 : 0;
  const ltv = ltvRaw.toFixed(2);
  const healthFactor =
    loanAmount && appraisedValue
      ? (parseInt(appraisedValue) / parseInt(loanAmount) / 1.5).toFixed(2)
      : null;

  function validate(): string | null {
    if (!loanAmount || parseInt(loanAmount) < 1) return 'Please enter a loan amount.';
    if (parseInt(loanAmount) > maxLoan)
      return `Loan amount cannot exceed ${formatXlmFromStroops(maxLoan)} (70% LTV).`;
    return null;
  }

  function handleNext() {
    const err = validate();
    if (err) {
      setField('error', err);
      return;
    }
    setField('error', null);
    nextStep();
  }

  const healthColor = !healthFactor
    ? 'text-brown/40'
    : parseFloat(healthFactor) >= 1.5
      ? 'text-green-600'
      : parseFloat(healthFactor) >= 1.0
        ? 'text-yellow-600'
        : 'text-red-600';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-brown">Choose Loan Amount</h2>
        <p className="text-brown/60 mt-1 text-sm">Maximum loan is 70% of your collateral value.</p>
      </div>

      {/* Max loan info */}
      <div className="bg-gold/10 border border-gold/30 rounded-xl px-4 py-3 flex justify-between items-center">
        <span className="text-sm text-brown/70">Available to borrow</span>
        <span className="font-bold text-brown text-lg">{formatXlmFromStroops(maxLoan)}</span>
      </div>

      {/* Amount input */}
      <div>
        {/* Label row: text + info tooltip */}
        <div className="flex items-center mb-1">
          <span className="text-sm font-medium text-brown">Loan Amount (stroops)</span>
          <FieldTooltip content={WIZARD_FIELD_TOOLTIPS.loanAmount} />
        </div>
        <NumericInput
          label=""
          aria-label="Loan Amount in stroops"
          placeholder="e.g. 5,000,000"
          value={loanAmount}
          onChange={(e) => setField('loanAmount', e.target.value)}
        />

        {/* LTV slider indicator */}
        {loanAmount && maxLoan > 0 && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-brown-400 mb-1">
              <span className="flex items-center gap-1">
                <GlossaryTerm termKey="ltv">LTV</GlossaryTerm>
                <FieldTooltip
                  content="Loan-to-Value (LTV) is how much you borrow compared to your collateral's value. A lower LTV means less risk and more room before liquidation."
                  label="What is LTV?"
                />
                : {ltv}%
              </span>
              <span>Max: 70%</span>
            </div>
            <div className="h-2 bg-brown-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  parseFloat(ltv) > 65
                    ? 'bg-error'
                    : parseFloat(ltv) > 50
                      ? 'bg-warning'
                      : 'bg-success'
                }`}
                style={{ width: `${(Math.min(parseFloat(ltv), 70) / 70) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Loan term */}
      <div>
        <div className="flex items-center mb-2">
          <label className="text-sm font-medium text-brown">Loan Term</label>
          <FieldTooltip content={WIZARD_FIELD_TOOLTIPS.loanTerm} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TERM_OPTIONS.map(({ days, label, rate }) => (
            <button
              key={days}
              onClick={() => setField('loanTermDays', days)}
              className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all text-center ${
                loanTermDays === days
                  ? 'border-gold bg-gold/10'
                  : 'border-brown/20 hover:border-brown/40 bg-white'
              }`}
            >
              <span className="font-semibold text-brown text-sm">{label}</span>
              <span className="text-brown/50 text-xs">{rate} fee</span>
            </button>
          ))}
        </div>
      </div>

      {/* Health factor preview */}
      {healthFactor && (
        <div className="bg-white border border-brown/20 rounded-xl px-4 py-3 flex justify-between items-center">
          <span className="text-sm text-brown/70 flex items-center gap-1">
            <GlossaryTerm termKey="healthFactor">Est. Health Factor</GlossaryTerm>
            <FieldTooltip
              content="Health Factor measures how safe your loan is. Above 1.5 is safe (green), 1.0–1.5 needs watching (yellow), below 1.0 risks liquidation (red)."
              label="What is Health Factor?"
            />
          </span>
          <span className={`font-bold text-lg ${healthColor}`}>{healthFactor}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="bg-error-light border border-error rounded-xl px-4 py-3 text-error-dark text-sm"
        >
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={prevStep}>
          ← Back
        </Button>
        <Button className="flex-[2]" onClick={handleNext}>
          Review Terms →
        </Button>
      </div>
    </div>
  );
}
