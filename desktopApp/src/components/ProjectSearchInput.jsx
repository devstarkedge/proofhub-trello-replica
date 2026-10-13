import { memo, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';
import { normalizeSearch } from '../../../shared/projectView.mjs';

// Keep keystrokes out of the large collection render. Only normalized,
// debounced queries reach the search engine; clearing is immediate.
const ProjectSearchInput = memo(({ onSearch, onInvalidate }) => {
  const [value, setValue] = useState('');
  const normalized = normalizeSearch(value);
  const [debounced] = useDebounce(normalized, 300);
  const last = useRef('');
  const previous = useRef('');
  useEffect(() => {
    if (debounced !== normalized || last.current === debounced) return;
    last.current = debounced;
    onSearch(debounced);
  }, [debounced, normalized, onSearch]);
  const change = next => {
    if (normalizeSearch(next) !== previous.current) last.current = null;
    previous.current = normalizeSearch(next);
    setValue(next);
    onInvalidate(next);
    if (!normalizeSearch(next)) last.current = '';
  };
  return (
    <div className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
      <input
        type="search"
        aria-label="Search projects and departments"
        placeholder="Search projects..."
        value={value}
        onChange={event => change(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape') change('');
        }}
        className="w-full pl-12 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => change('')}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 rounded-full transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      )}
      {normalized !== debounced && <span role="status" className="sr-only">Searching...</span>}
    </div>
  );
});
ProjectSearchInput.displayName = 'ProjectSearchInput';
export default ProjectSearchInput;
