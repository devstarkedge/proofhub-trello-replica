import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Search, 
  X, 
  Clock, 
  User, 
  Briefcase, 
  Building2,
  Hash,
  Loader2
} from 'lucide-react';

/**
 * GlobalSearch - Finance module global search with autocomplete
 * Supports searching by:
 * - User name
 * - Project/Board name
 * - Client name
 * - Upwork ID
 */
const GlobalSearch = ({ 
  data = [],
  type = 'users', // 'users' or 'projects'
  onSelect,
  onFilter,
  placeholder = 'Search users, projects, clients...'
}) => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`finance-recent-searches-${type}`);
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading recent searches:', e);
      }
    }
  }, [type]);

  // Save recent search
  const saveRecentSearch = (search) => {
    const updated = [search, ...recentSearches.filter(s => s.value !== search.value)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem(`finance-recent-searches-${type}`, JSON.stringify(updated));
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter suggestions based on query
  const suggestions = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];

    const lowerQuery = query.toLowerCase();
    const results = [];

    if (type === 'users') {
      data.forEach(user => {
        const userName = user.userName || user.name || '';
        const email = user.email || '';
        const department = user.departmentName || user.department || '';

        if (userName.toLowerCase().includes(lowerQuery)) {
          results.push({
            type: 'user',
            icon: User,
            label: userName,
            sublabel: department || email,
            value: user.userId || user._id,
            data: user
          });
        }

        if (department && department.toLowerCase().includes(lowerQuery)) {
          const exists = results.find(r => r.type === 'department' && r.label === department);
          if (!exists) {
            results.push({
              type: 'department',
              icon: Building2,
              label: department,
              sublabel: 'Department',
              value: department,
              data: { department }
            });
          }
        }
      });
    }

    if (type === 'projects') {
      data.forEach(project => {
        const projectName = project.boardName || project.name || project.title || '';
        const clientName = project.clientName || project.client || '';
        const upworkId = project.upworkId || '';
        const department = project.departmentName || project.department || '';

        if (projectName.toLowerCase().includes(lowerQuery)) {
          results.push({
            type: 'project',
            icon: Briefcase,
            label: projectName,
            sublabel: clientName || department,
            value: project.boardId || project._id,
            data: project
          });
        }

        if (clientName && clientName.toLowerCase().includes(lowerQuery)) {
          const exists = results.find(r => r.type === 'client' && r.label === clientName);
          if (!exists) {
            results.push({
              type: 'client',
              icon: Building2,
              label: clientName,
              sublabel: 'Client',
              value: clientName,
              data: { client: clientName }
            });
          }
        }

        if (upworkId && upworkId.toLowerCase().includes(lowerQuery)) {
          results.push({
            type: 'upwork',
            icon: Hash,
            label: upworkId,
            sublabel: projectName,
            value: upworkId,
            data: project
          });
        }

        if (department && department.toLowerCase().includes(lowerQuery)) {
          const exists = results.find(r => r.type === 'department' && r.label === department);
          if (!exists) {
            results.push({
              type: 'department',
              icon: Building2,
              label: department,
              sublabel: 'Department',
              value: department,
              data: { department }
            });
          }
        }
      });
    }

    return results.slice(0, 10);
  }, [query, data, type]);

  // Handle selection
  const handleSelect = (suggestion) => {
    saveRecentSearch({
      ...suggestion,
      timestamp: Date.now()
    });
    
    setQuery(suggestion.label);
    setFocused(false);

    if (onSelect) {
      onSelect(suggestion);
    }

    if (onFilter) {
      onFilter(suggestion);
    }
  };

  // Handle clear
  const handleClear = () => {
    setQuery('');
    if (onFilter) {
      onFilter(null);
    }
    inputRef.current?.focus();
  };

  // Clear recent search
  const clearRecentSearch = (e, search) => {
    e.stopPropagation();
    const updated = recentSearches.filter(s => s.value !== search.value);
    setRecentSearches(updated);
    localStorage.setItem(`finance-recent-searches-${type}`, JSON.stringify(updated));
  };

  const showDropdown = focused && (suggestions.length > 0 || (query.length === 0 && recentSearches.length > 0));

  const getTypeColor = (itemType) => {
    switch (itemType) {
      case 'user': return '#10b981';
      case 'project': return '#3b82f6';
      case 'client': return '#8b5cf6';
      case 'department': return '#f59e0b';
      case 'upwork': return '#14b8a6';
      default: return '#6b7280';
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Search Input */}
      <div 
        className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all duration-200"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: focused ? '#10b981' : 'var(--color-border-subtle)',
          boxShadow: focused ? '0 0 0 2px rgba(16, 185, 129, 0.2)' : 'none'
        }}
      >
        <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-secondary)' }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none text-sm"
          style={{ color: 'var(--color-text-primary)' }}
        />
        {query && (
          <button
            onClick={handleClear}
            className="p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div 
          className="absolute top-full left-0 right-0 mt-2 py-2 rounded-xl border z-[100] max-h-80 overflow-y-auto"
          style={{
            backgroundColor: '#ffffff',
            borderColor: '#e5e7eb',
            boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2), 0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)'
          }}
        >
          {/* Recent Searches */}
          {query.length === 0 && recentSearches.length > 0 && (
            <>
              <div className="px-4 py-2 flex items-center gap-2">
                <Clock className="w-3 h-3" style={{ color: 'var(--color-text-secondary)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Recent Searches
                </span>
              </div>
              {recentSearches.map((search, index) => {
                const Icon = search.type === 'user' ? User :
                           search.type === 'project' ? Briefcase :
                           search.type === 'client' ? Building2 :
                           search.type === 'department' ? Building2 :
                           search.type === 'upwork' ? Hash : Search;

                return (
                  <button
                    key={`recent-${index}`}
                    onClick={() => handleSelect(search)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors group"
                  >
                    <Icon className="w-4 h-4" style={{ color: getTypeColor(search.type) }} />
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {search.label}
                      </p>
                      {search.sublabel && (
                        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          {search.sublabel}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => clearRecentSearch(e, search)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 transition-all"
                    >
                      <X className="w-3 h-3" style={{ color: 'var(--color-text-secondary)' }} />
                    </button>
                  </button>
                );
              })}
              {suggestions.length > 0 && (
                <div className="border-t my-2" style={{ borderColor: 'var(--color-border-subtle)' }} />
              )}
            </>
          )}

          {/* Search Suggestions */}
          {suggestions.map((suggestion, index) => (
            <button
              key={`suggestion-${index}`}
              onClick={() => handleSelect(suggestion)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
            >
              <suggestion.icon className="w-4 h-4" style={{ color: getTypeColor(suggestion.type) }} />
              <div className="flex-1 text-left">
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {highlightMatch(suggestion.label, query)}
                </p>
                {suggestion.sublabel && (
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {suggestion.sublabel}
                  </p>
                )}
              </div>
              <span 
                className="px-2 py-0.5 rounded text-xs font-medium"
                style={{ 
                  backgroundColor: `${getTypeColor(suggestion.type)}20`,
                  color: getTypeColor(suggestion.type)
                }}
              >
                {suggestion.type}
              </span>
            </button>
          ))}

          {/* No Results */}
          {query.length >= 2 && suggestions.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                No results found for "{query}"
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Helper function to highlight matching text
const highlightMatch = (text, query) => {
  if (!query.trim()) return text;
  
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <>
      {parts.map((part, index) => 
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={index} className="bg-emerald-500/30 rounded px-0.5">{part}</span>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
};

export default GlobalSearch;
