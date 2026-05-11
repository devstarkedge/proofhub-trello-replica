import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Lock, X } from 'lucide-react';

export default function PushNotificationPrompt({ prompt }) {
  if (!prompt?.isOpen) return null;

  // Support 'blocked', 'denied' as requiring guidance
  const needsGuidance = prompt.mode === 'blocked' || prompt.mode === 'denied';

  return (
    <AnimatePresence>
      <div className="push-prompt-overlay" style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="push-prompt-card"
          style={{
            background: 'var(--surface-primary, #fff)',
            borderRadius: 16,
            width: '100%',
            maxWidth: 400,
            padding: 32,
            boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
            position: 'relative',
            textAlign: 'center',
            color: 'var(--text-primary, #111827)',
          }}
        >
          {needsGuidance ? (
            <>
              <button 
                onClick={prompt.onLater}
                style={{
                  position: 'absolute', top: 16, right: 16,
                  background: 'none', border: 'none',
                  color: 'var(--text-muted, #9ca3af)', cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X size={20} />
              </button>

              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'var(--bg-secondary, #f3f4f6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <Lock size={28} color="var(--text-secondary, #4b5563)" />
              </div>

              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>
                Notifications blocked
              </h2>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary, #4b5563)', margin: '0 0 24px' }}>
                Your browser is currently blocking notifications for FlowTask. To receive alerts, click the lock icon <strong>🔒</strong> in your address bar and change the notifications setting to <strong>Allow</strong>.
              </p>
              
              <button
                onClick={prompt.onLater}
                style={{
                  width: '100%', padding: '12px',
                  background: 'var(--bg-secondary, #f3f4f6)', color: 'var(--text-primary, #111827)',
                  border: '1px solid var(--border-primary, #e5e7eb)', borderRadius: 8,
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Got it
              </button>
            </>
          ) : (
            <>
              <div style={{
                display: 'inline-block',
                background: 'var(--accent-color, #dbeafe)',
                color: 'var(--accent-primary, #2563eb)',
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginBottom: 20,
              }}>
                Push Notifications
              </div>

              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'var(--accent-color, #dbeafe)',
                color: 'var(--accent-primary, #2563eb)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <Bell size={32} />
              </div>

              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 16px' }}>
                Stay on top of everything
              </h2>
              
              <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary, #4b5563)', margin: '0 0 24px' }}>
                Get instant alerts for task assignments, mentions, and project updates — even when the app is in the background.
              </p>

              <ul style={{ 
                textAlign: 'left', 
                margin: '0 0 32px', 
                padding: '0 0 0 20px', 
                fontSize: 14, 
                color: 'var(--text-secondary, #4b5563)',
                lineHeight: 1.8 
              }}>
                <li>Task assignments & updates</li>
                <li>Mentions in comments</li>
                <li>New messages & project changes</li>
              </ul>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button
                  onClick={() => prompt.onEnable({ silent: false })}
                  disabled={prompt.isBusy}
                  style={{
                    width: '100%', padding: '12px',
                    background: 'var(--accent-primary, #2563eb)', color: '#fff',
                    border: 'none', borderRadius: 8,
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Bell size={16} />
                  {prompt.isBusy ? 'Enabling...' : 'Enable notifications'}
                </button>
                <button
                  onClick={prompt.onLater}
                  disabled={prompt.isBusy}
                  style={{
                    width: '100%', padding: '12px',
                    background: 'transparent', color: 'var(--text-secondary, #4b5563)',
                    border: '1px solid var(--border-primary, #e5e7eb)', borderRadius: 8,
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Maybe later
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
