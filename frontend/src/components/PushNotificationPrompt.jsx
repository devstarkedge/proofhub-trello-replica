import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BellRing, Lock, X, Check, Loader2 } from 'lucide-react';

export default function PushNotificationPrompt({ prompt }) {
  if (!prompt?.isOpen) return null;

  // Support 'blocked', 'denied' as requiring guidance
  const needsGuidance = prompt.mode === 'blocked' || prompt.mode === 'denied';

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs transition-opacity duration-200"
        onClick={prompt.onLater}
      >
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          onClick={(event) => event.stopPropagation()}
          className="relative w-full max-w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border shadow-2xl p-5 sm:p-7 text-center max-h-[92vh] overflow-y-auto"
          style={{
            backgroundColor: 'var(--color-card-bg)',
            borderColor: 'var(--color-border-subtle)',
            color: 'var(--color-text-primary)'
          }}
        >
          {/* Mobile Bottom Sheet Pull Bar Indicator */}
          <div className="w-10 h-1 rounded-full bg-[var(--color-border-default)] mx-auto mb-3.5 sm:hidden opacity-80" />

          {/* Close Button */}
          <button
            type="button"
            onClick={prompt.onLater}
            aria-label="Close"
            className="absolute top-4 right-4 sm:top-5 sm:right-5 rounded-full p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>

          {needsGuidance ? (
            /* Mode 1: Notifications Blocked / Denied Guidance */
            <div className="pt-2 sm:pt-0">
              {/* Icon Visual */}
              <div className="mx-auto mb-4 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25">
                <Lock className="h-7 w-7 sm:h-8 sm:w-8" />
              </div>

              <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-2 text-[var(--color-text-primary)]">
                Notifications Blocked
              </h2>

              <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed max-w-sm mx-auto mb-6">
                Your browser is currently blocking notifications for FlowTask. To receive real-time alerts, click the lock icon{' '}
                <strong className="text-[var(--color-text-primary)] font-semibold">🔒</strong> in your browser&apos;s address bar and set notifications to{' '}
                <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">Allow</strong>.
              </p>

              <button
                type="button"
                onClick={prompt.onLater}
                className="w-full h-11 sm:h-10 rounded-xl font-semibold text-xs sm:text-sm bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] hover:bg-[var(--color-bg-muted)] active:scale-[0.99] transition-all cursor-pointer shadow-2xs"
              >
                Got it
              </button>
            </div>
          ) : (
            /* Mode 2: Standard Opt-In Prompt */
            <div className="pt-1 sm:pt-0">
              {/* Top Pill Badge */}
              <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-[var(--color-primary-subtle)] text-[var(--color-primary)] border border-[var(--color-primary)]/20 mb-3.5">
                <BellRing className="h-3.5 w-3.5 text-indigo-500" />
                <span>Push Notifications</span>
              </div>

              {/* Glowing Icon Visual */}
              <div className="relative mx-auto mb-4 flex h-15 w-15 sm:h-16 sm:w-16 items-center justify-center">
                <div className="absolute inset-0 rounded-2xl bg-indigo-500/15 animate-ping opacity-75" />
                <div className="relative flex h-13 w-13 sm:h-15 sm:w-15 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-500/25">
                  <Bell className="h-6 w-6 sm:h-7 sm:w-7" />
                </div>
              </div>

              {/* Title & Description */}
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight mb-2 text-[var(--color-text-primary)]">
                Stay on top of everything
              </h2>

              <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed max-w-sm mx-auto mb-4">
                Get instant alerts for task assignments, mentions, and project updates — even when the app is in the background.
              </p>

              {/* Feature Highlights Box */}
              <div className="mb-5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)]/60 p-3 sm:p-3.5 text-left space-y-2">
                {[
                  'Task assignments & updates',
                  'Mentions in comments',
                  'New messages & project changes'
                ].map((text, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 text-xs sm:text-sm">
                    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3 w-3 stroke-[2.5]" />
                    </div>
                    <span className="font-medium text-[var(--color-text-primary)]">{text}</span>
                  </div>
                ))}
              </div>

              {/* Responsive Action Buttons */}
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => prompt.onEnable({ silent: false })}
                  disabled={prompt.isBusy}
                  className="w-full h-11 sm:h-10 rounded-xl font-semibold text-xs sm:text-sm text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] transition-all cursor-pointer shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {prompt.isBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Enabling notifications…</span>
                    </>
                  ) : (
                    <>
                      <Bell className="h-4 w-4" />
                      <span>Enable notifications</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={prompt.onLater}
                  disabled={prompt.isBusy}
                  className="w-full h-10 sm:h-9 rounded-xl font-semibold text-xs sm:text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] border border-[var(--color-border-default)] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
                >
                  Maybe later
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
