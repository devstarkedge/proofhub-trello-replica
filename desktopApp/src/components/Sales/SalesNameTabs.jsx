import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Users } from 'lucide-react';
import useSalesStore from '../../store/salesStore';

const MAX_VISIBLE_TABS = 10;

/* Deterministic color for each name */
const TAB_COLORS = [
  'from-blue-500 to-blue-600',
  'from-emerald-500 to-emerald-600',
  'from-violet-500 to-violet-600',
  'from-amber-500 to-amber-600',
  'from-rose-500 to-rose-600',
  'from-cyan-500 to-cyan-600',
  'from-indigo-500 to-indigo-600',
  'from-teal-500 to-teal-600',
  'from-pink-500 to-pink-600',
  'from-orange-500 to-orange-600',
];
const getTabColor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return TAB_COLORS[Math.abs(hash) % TAB_COLORS.length];
};

const SalesNameTabs = () => {
  const { uniqueNames, nameTab, setNameTab, pagination } = useSalesStore();
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef(null);
  const scrollRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setShowMore(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const visibleTabs = useMemo(() => uniqueNames.slice(0, MAX_VISIBLE_TABS), [uniqueNames]);
  const overflowTabs = useMemo(() => uniqueNames.slice(MAX_VISIBLE_TABS), [uniqueNames]);
  const totalCount = useMemo(() => uniqueNames.reduce((sum, n) => sum + n.count, 0), [uniqueNames]);

  const handleTabClick = useCallback((name) => {
    setNameTab(name);
    setShowMore(false);
  }, [setNameTab]);

  if (uniqueNames.length === 0) return null;

  const activeInOverflow = overflowTabs.some(t => t.name === nameTab);

  return (
    <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border-b border-gray-200/60 dark:border-gray-700/60">
      <div className="px-6 py-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none" ref={scrollRef}>
        {/* All tab */}
        <button
          onClick={() => handleTabClick('All')}
          className={`relative shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
            nameTab === 'All'
              ? 'bg-gradient-to-r from-gray-800 to-gray-900 dark:from-gray-100 dark:to-gray-200 text-white dark:text-gray-900 shadow-md shadow-gray-400/30 dark:shadow-gray-700/30 scale-[1.02]'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          All
          <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold ${
            nameTab === 'All'
              ? 'bg-white/20 dark:bg-gray-900/20 text-white/90 dark:text-gray-900/70'
              : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
          }`}>
            {totalCount}
          </span>
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 shrink-0" />

        {/* Name tabs */}
        {visibleTabs.map((item) => (
          <button
            key={item.name}
            onClick={() => handleTabClick(item.name)}
            className={`relative shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
              nameTab === item.name
                ? `bg-gradient-to-r ${getTabColor(item.name)} text-white shadow-md scale-[1.02]`
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            {item.name}
            <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold ${
              nameTab === item.name
                ? 'bg-white/20 text-white/90'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
            }`}>
              {item.count}
            </span>
          </button>
        ))}

        {/* More dropdown */}
        {overflowTabs.length > 0 && (
          <div className="relative shrink-0" ref={moreRef}>
            <button
              onClick={() => setShowMore(!showMore)}
              className={`inline-flex items-center gap-1 px-3.5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                activeInOverflow
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 border border-gray-200 dark:border-gray-600'
              }`}
            >
              {activeInOverflow ? nameTab : 'More'}
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">
                +{overflowTabs.length}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} />
            </button>

            {showMore && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 py-1.5 max-h-64 overflow-y-auto"
              >
                {overflowTabs.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => handleTabClick(item.name)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                      nameTab === item.name
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                      {item.count}
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesNameTabs;
