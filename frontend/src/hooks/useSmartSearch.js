import { useCallback, useEffect, useMemo, useRef } from 'react';
import useSmartSearchStore from '../store/smartSearchStore';
import Database from '../services/database';

// Lightweight debounce helper
function debounce(fn, ms) {
  let timer;
  const debounced = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

// Fuzzy-ish substring match (case-insensitive includes)
function textMatches(text, query) {
  if (!text || !query) return false;
  return text.toLowerCase().includes(query.toLowerCase());
}

/**
 * Central hook that wires smart search store → suggestion fetching → card filtering.
 *
 * @param {Object} opts
 * @param {Array}  opts.cards          – base card array (already role-filtered)
 * @param {string} opts.departmentId   – current department _id (or 'all')
 * @param {Object} opts.legacyFilters  – { status, priority, dateFrom, dateTo } from ListView
 * @param {Object} opts.sorting        – { key, order }
 * @returns {Object} { filteredCards, previewCount, searchTerms }
 */
export default function useSmartSearch({ cards = [], departmentId, legacyFilters = {}, sorting = {} }) {
  const {
    activeField,
    searchText,
    chips,
    setSearchText,
    setSuggestions,
    setSuggestionsLoading,
    setShowSuggestions,
    setPreviewCount,
    addRecentSearch,
  } = useSmartSearchStore();

  // ─── Suggestion fetching (debounced) ───────────────────────────────
  const fetchSuggestionsRef = useRef(null);

  if (!fetchSuggestionsRef.current) {
    fetchSuggestionsRef.current = debounce(async (field, query, deptId) => {
      if (!query || query.length < 1) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      // Priority and Status can be handled purely client-side for speed
      if (field === 'priority') {
        const priorities = [
          { value: 'low', label: 'Low', type: 'priority' },
          { value: 'medium', label: 'Medium', type: 'priority' },
          { value: 'high', label: 'High', type: 'priority' },
          { value: 'critical', label: 'Critical', type: 'priority' },
        ];
        const filtered = priorities.filter(p => p.label.toLowerCase().includes(query.toLowerCase()));
        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
        return;
      }

      if (field === 'status') {
        const statuses = [
          { value: 'to do', label: 'To Do', type: 'status' },
          { value: 'in progress', label: 'In Progress', type: 'status' },
          { value: 'review', label: 'Review', type: 'status' },
          { value: 'done', label: 'Done', type: 'status' },
          { value: 'blocked', label: 'Blocked', type: 'status' },
        ];
        const filtered = statuses.filter(s => s.label.toLowerCase().includes(query.toLowerCase()));
        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
        return;
      }

      // Server-side suggestions for task / project / assignee / all
      setSuggestionsLoading(true);
      try {
        const res = await Database.getSearchSuggestions(field, query, deptId);
        if (res.success) {
          setSuggestions(res.data);
          setShowSuggestions(res.data.length > 0);
        }
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 250);
  }

  const fetchSuggestions = useCallback((field, query, deptId) => {
    fetchSuggestionsRef.current(field, query, deptId);
  }, []);

  // Cancel pending on unmount
  useEffect(() => () => fetchSuggestionsRef.current?.cancel(), []);

  // Trigger suggestions when searchText or activeField changes
  useEffect(() => {
    if (searchText.length >= 1) {
      fetchSuggestions(activeField, searchText, departmentId);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [searchText, activeField, departmentId, fetchSuggestions, setSuggestions, setShowSuggestions]);

  // ─── Filtering engine ──────────────────────────────────────────────
  const filteredCards = useMemo(() => {
    let filtered = cards;

    // 1) Legacy status dropdown
    if (legacyFilters.status && legacyFilters.status !== 'all') {
      filtered = filtered.filter(card =>
        card.list?.title?.toLowerCase().replace(' ', '-') === legacyFilters.status
      );
    }

    // 2) Legacy priority dropdown
    if (legacyFilters.priority && legacyFilters.priority !== 'all') {
      filtered = filtered.filter(card =>
        card.priority?.toLowerCase() === legacyFilters.priority
      );
    }

    // 3) Legacy date range
    if (legacyFilters.dateFrom || legacyFilters.dateTo) {
      filtered = filtered.filter(card => {
        if (!card.dueDate) return false;
        const cardDate = new Date(card.dueDate);
        if (legacyFilters.dateFrom && cardDate < new Date(legacyFilters.dateFrom)) return false;
        if (legacyFilters.dateTo && cardDate > new Date(legacyFilters.dateTo)) return false;
        return true;
      });
    }

    // 4) Smart chip filters
    if (chips.length > 0) {
      // Group chips by field
      const chipsByField = {};
      chips.forEach(chip => {
        if (!chipsByField[chip.field]) chipsByField[chip.field] = [];
        chipsByField[chip.field].push(chip.value);
      });

      // Apply each field group (AND between fields, OR within same field)
      Object.entries(chipsByField).forEach(([field, values]) => {
        filtered = filtered.filter(card => {
          return values.some(val => {
            switch (field) {
              case 'task':
                return textMatches(card.title, val);
              case 'project':
                return textMatches(card.board?.name, val);
              case 'assignee':
                return card.assignees?.some(a => textMatches(a.name, val));
              case 'priority':
                return textMatches(card.priority, val);
              case 'status':
                return textMatches(card.list?.title, val);
              default:
                return false;
            }
          });
        });
      });
    }

    // 5) Free-text search (All mode — no chip, searches across everything)
    if (searchText && activeField === 'all') {
      const q = searchText.toLowerCase();
      filtered = filtered.filter(card => {
        return (
          textMatches(card.title, q) ||
          textMatches(card.board?.name, q) ||
          card.assignees?.some(a => textMatches(a.name, q)) ||
          textMatches(card.priority, q) ||
          textMatches(card.list?.title, q) ||
          textMatches(card.description, q)
        );
      });
    }

    // 6) Sorting
    const sorted = [...filtered].sort((a, b) => {
      let aValue, bValue;

      if (sorting.key === 'board.name') {
        aValue = a.board?.name; bValue = b.board?.name;
      } else if (sorting.key === 'assignees[0].name') {
        aValue = a.assignees?.[0]?.name; bValue = b.assignees?.[0]?.name;
      } else if (sorting.key === 'list.title') {
        aValue = a.list?.title; bValue = b.list?.title;
      } else {
        aValue = a[sorting.key]; bValue = b[sorting.key];
      }

      if (aValue === bValue) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      let result;
      if (sorting.key === 'dueDate') {
        result = new Date(aValue) - new Date(bValue);
      } else {
        result = String(aValue).localeCompare(String(bValue));
      }

      return sorting.order === 'asc' ? result : -result;
    });

    return sorted;
  }, [cards, legacyFilters, chips, searchText, activeField, sorting]);

  // Update preview count
  useEffect(() => {
    setPreviewCount(filteredCards.length);
  }, [filteredCards.length, setPreviewCount]);

  // ─── Search terms for highlighting ─────────────────────────────────
  const searchTerms = useMemo(() => {
    const terms = [];
    if (searchText && activeField === 'all') terms.push(searchText);
    chips.forEach(c => terms.push(c.value));
    return terms;
  }, [searchText, activeField, chips]);

  return { filteredCards, previewCount: filteredCards.length, searchTerms, addRecentSearch };
}
