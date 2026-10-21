'use client';

import { formatFiat, formatXlm } from '@/lib/formatMoney';

interface Installment {
  date: string;
  amount: number;
  status: 'paid' | 'overdue' | 'upcoming';
  daysUntilDue?: number;
}

interface RepaymentTimelineProps {
  installments: Installment[];
  currency?: string;
}

export default function RepaymentTimeline({
  installments,
  currency = 'XLM',
}: RepaymentTimelineProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-success text-white';
      case 'overdue':
        return 'bg-error text-white';
      case 'upcoming':
        return 'bg-brown/20 text-brown';
      default:
        return 'bg-brown/10 text-brown';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid':
        return '✓ Paid';
      case 'overdue':
        return '⚠ Overdue';
      case 'upcoming':
        return 'Upcoming';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="relative py-4 px-2">
        {/* Continuous Vertical Line */}
        <div className="absolute left-[2.25rem] top-8 bottom-8 w-0.5 bg-brown/10 -ml-px z-0" />

        <div className="flex flex-col gap-8">
          {installments.map((installment, index) => (
            <div key={index} className="relative flex items-start gap-4 z-10">
              {/* Timeline node */}
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${getStatusColor(
                  installment.status
                )} border-2 border-brown/10 flex-shrink-0 bg-white`}
              >
                {installment.status === 'paid' ? '✓' : index + 1}
              </div>

              {/* Card content */}
              <div className="flex-1 bg-white border border-brown/10 rounded-lg p-3 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-semibold text-brown/70 mb-1">
                      {formatDate(installment.date)}
                    </p>
                    <p className="text-lg font-bold text-brown dark:text-cream-50 mb-2">
                      {currency === 'XLM'
                        ? formatXlm(installment.amount)
                        : formatFiat(installment.amount, currency)}
                    </p>
                  </div>
                  <div
                    className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                      installment.status
                    )}`}
                  >
                    {getStatusLabel(installment.status)}
                  </div>
                </div>

                {installment.status === 'upcoming' && installment.daysUntilDue !== undefined && (
                  <p className="text-xs text-brown/60 mt-1">
                    {installment.daysUntilDue === 0
                      ? 'Due today'
                      : `${installment.daysUntilDue} day${installment.daysUntilDue !== 1 ? 's' : ''} remaining`}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4 text-center">
        <div className="p-3 bg-success/10 rounded-lg">
          <p className="text-xs text-brown/70 mb-1">Paid</p>
          <p className="text-lg font-bold text-success">
            {installments.filter((i) => i.status === 'paid').length}
          </p>
        </div>
        <div className="p-3 bg-error/10 rounded-lg">
          <p className="text-xs text-brown/70 mb-1">Overdue</p>
          <p className="text-lg font-bold text-error">
            {installments.filter((i) => i.status === 'overdue').length}
          </p>
        </div>
        <div className="p-3 bg-brown/10 rounded-lg">
          <p className="text-xs text-brown/70 mb-1">Upcoming</p>
          <p className="text-lg font-bold text-brown">
            {installments.filter((i) => i.status === 'upcoming').length}
          </p>
        </div>
      </div>
    </div>
  );
}
