import React, { memo } from 'react';

export const TabNavigation = memo(({ tabs, activeTab, onTabChange, variant = 'default' }) => (
  <div className={variant === 'view' ? "flex gap-1 p-1 bg-white/10 rounded-xl backdrop-blur-sm" : "flex gap-2 px-6"}>
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        onClick={() => onTabChange(tab.id)}
        className={variant === 'view'
          ? `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`
          : `flex items-center gap-2 px-6 py-3 rounded-t-xl text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-[#f4f5f7] text-blue-600'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`
        }
      >
        <tab.icon size={16} />
        {tab.label}
        {tab.badge !== undefined && tab.badge !== null && (
          <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 text-xs font-semibold rounded-full">
            {tab.badge}
          </span>
        )}
      </button>
    ))}
  </div>
));

TabNavigation.displayName = 'TabNavigation';
