import React from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

const NetworkStatusToast = () => {
  const {
    showOfflineToast,
    showOnlineToast,
    dismissOfflineToast,
    dismissOnlineToast,
  } = useNetworkStatus();

  return (
    <>
      {/* Offline Toast */}
      <div
        className={`fixed top-4 right-4 z-[9999] transition-all duration-300 ease-out transform ${
          showOfflineToast
            ? 'translate-x-0 opacity-100'
            : 'translate-x-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl backdrop-blur-xl bg-gradient-to-r from-amber-500/95 to-orange-500/95 border border-amber-400/30 min-w-[320px] max-w-[400px]">
          {/* Animated Wifi Off Icon */}
          <div className="flex-shrink-0 relative">
            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
                />
              </svg>
            </div>
            {/* Subtle glow effect */}
            <div className="absolute inset-0 w-11 h-11 rounded-full bg-white/10 blur-md animate-ping" style={{ animationDuration: '2s' }} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="text-white font-semibold text-sm tracking-wide">
              No Internet Connection
            </h4>
            <p className="text-white/80 text-xs mt-0.5 leading-relaxed">
              Please check your network.
            </p>
          </div>

          {/* Close Button */}
          <button
            onClick={dismissOfflineToast}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-200 flex items-center justify-center group"
            aria-label="Dismiss notification"
          >
            <svg
              className="w-4 h-4 text-white/70 group-hover:text-white transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Online Toast */}
      <div
        className={`fixed top-4 right-4 z-[9999] transition-all duration-300 ease-out transform ${
          showOnlineToast
            ? 'translate-x-0 opacity-100'
            : 'translate-x-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl backdrop-blur-xl bg-gradient-to-r from-emerald-500/95 to-green-500/95 border border-emerald-400/30 min-w-[320px] max-w-[400px]">
          {/* Animated Wifi Icon */}
          <div className="flex-shrink-0 relative">
            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white animate-bounce"
                style={{ animationDuration: '1s', animationIterationCount: '2' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                />
              </svg>
            </div>
            {/* Success glow */}
            <div className="absolute inset-0 w-11 h-11 rounded-full bg-white/20 blur-md animate-pulse" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="text-white font-semibold text-sm tracking-wide">
              You're Back Online
            </h4>
            <p className="text-white/80 text-xs mt-0.5 leading-relaxed">
              Your connection has been restored.
            </p>
          </div>

          {/* Close Button */}
          <button
            onClick={dismissOnlineToast}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-200 flex items-center justify-center group"
            aria-label="Dismiss notification"
          >
            <svg
              className="w-4 h-4 text-white/70 group-hover:text-white transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
};

export default NetworkStatusToast;
