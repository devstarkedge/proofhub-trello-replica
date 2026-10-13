import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Users, Shield, User } from 'lucide-react';
import Avatar from './Avatar';

/**
 * MentionList - Enhanced mention dropdown supporting @User, @Role, @Team
 * Features: Avatars, type badges, category grouping, keyboard navigation, dark mode
 */
const MentionList = forwardRef(({ items = [], command }, ref) => {
  const [selected, setSelected] = useState(0);

  // Expose onKeyDown through ref for TipTap integration
  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelected((s) => Math.min(s + 1, items.length - 1));
        return true;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
        return true;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (items[selected]) command(items[selected]);
        return true;
      }
      return false;
    }
  }));

  // Reset selection when items change
  useEffect(() => {
    setSelected(0);
  }, [items]);

  // Ensure selected stays in bounds
  useEffect(() => {
    if (selected >= items.length && items.length > 0) {
      setSelected(items.length - 1);
    }
  }, [items.length, selected]);

  // Get icon for mention type
  const getTypeIcon = (type) => {
    switch (type) {
      case 'role':
        return <Shield size={12} className="text-purple-500" />;
      case 'team':
        return <Users size={12} className="text-teal-500" />;
      default:
        return null;
    }
  };

  // Get type badge styling
  const getTypeBadge = (type) => {
    switch (type) {
      case 'role':
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 rounded">
            Role
          </span>
        );
      case 'team':
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300 rounded">
            Team
          </span>
        );
      default:
        return null;
    }
  };

  // Group items by type for better UX
  const groupedItems = items.reduce((acc, item) => {
    const type = item.type || 'user';
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {});

  // Get flat list with section headers
  const flatListWithHeaders = [];
  let globalIndex = 0;
  const indexMap = {};

  // Order: users first, then roles, then teams
  const typeOrder = ['user', 'role', 'team'];
  const typeHeaders = {
    user: 'Users',
    role: 'Roles',
    team: 'Teams'
  };

  typeOrder.forEach(type => {
    if (groupedItems[type] && groupedItems[type].length > 0) {
      // Only add header if there are multiple types
      const hasMultipleTypes = Object.keys(groupedItems).length > 1;
      if (hasMultipleTypes) {
        flatListWithHeaders.push({ type: 'header', label: typeHeaders[type], key: `header-${type}` });
      }
      groupedItems[type].forEach(item => {
        indexMap[globalIndex] = item;
        flatListWithHeaders.push({ type: 'item', item, globalIndex });
        globalIndex++;
      });
    }
  });

  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden w-64">
        <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2">
          <User size={16} className="opacity-50" />
          <span>No results found</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden w-64 max-h-72 overflow-y-auto">
      {flatListWithHeaders.map((entry) => {
        if (entry.type === 'header') {
          return (
            <div
              key={entry.key}
              className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700 sticky top-0"
            >
              {entry.label}
            </div>
          );
        }

        const { item, globalIndex: idx } = entry;
        const isSelected = idx === selected;

        return (
          <div
            key={item.id || `mention-${idx}`}
            onClick={() => command(item)}
            className={`px-3 py-2 cursor-pointer text-sm flex items-center gap-2.5 transition-colors ${
              isSelected 
                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100' 
                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200'
            }`}
          >
            {/* Avatar or Type Icon */}
            {item.type === 'user' || !item.type ? (
              <Avatar 
                src={item.avatar} 
                name={item.label} 
                size="xs"
                showBadge={false}
              />
            ) : (
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                item.type === 'role' 
                  ? 'bg-purple-100 dark:bg-purple-900/50' 
                  : 'bg-teal-100 dark:bg-teal-900/50'
              }`}>
                {getTypeIcon(item.type)}
              </div>
            )}
            
            {/* Label */}
            <span className="flex-1 truncate font-medium">
              {item.label}
            </span>
            
            {/* Type Badge */}
            {getTypeBadge(item.type)}
          </div>
        );
      })}
    </div>
  );
});

MentionList.displayName = 'MentionList';

export default MentionList;