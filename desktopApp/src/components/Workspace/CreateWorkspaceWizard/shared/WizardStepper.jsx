import React from 'react';
import { Check } from 'lucide-react';

/**
 * Sequential "① Basics ─── ② Setup" progress indicator with checkmarks on
 * completed steps. ProjectModals/shared/TabNavigation.jsx is a side-by-side
 * clickable tab bar, not a fit for this sequential wizard flow, so this is
 * a small purpose-built component instead.
 */
const WizardStepper = ({ steps, currentStep }) => {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-4">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;

        return (
          <React.Fragment key={step}>
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors"
                style={{
                  backgroundColor: isCompleted || isCurrent ? '#10b981' : 'var(--color-bg-muted)',
                  color: isCompleted || isCurrent ? '#ffffff' : 'var(--color-text-muted)',
                }}
              >
                {isCompleted ? <Check size={14} /> : stepNumber}
              </div>
              <span
                className="text-sm font-medium hidden sm:inline"
                style={{ color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
              >
                {step}
              </span>
            </div>
            {stepNumber < steps.length && (
              <div
                className="w-8 sm:w-12 h-0.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: isCompleted ? '#10b981' : 'var(--color-border-default)' }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default WizardStepper;
