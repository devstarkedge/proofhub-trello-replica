import { create } from 'zustand';

let savedRecent = JSON.parse(localStorage.getItem('flowtask_smart_recent') || 'null');
if (!savedRecent) {
  savedRecent = { all: [], task: [], project: [], assignee: [], priority: [], status: [] };
} else if (Array.isArray(savedRecent)) {
  savedRecent = { all: savedRecent.slice(0, 8), task: [], project: [], assignee: [], priority: [], status: [] };
} else {
  // Ensure all keys exist
  savedRecent = {
    all: savedRecent.all || [],
    task: savedRecent.task || [],
    project: savedRecent.project || [],
    assignee: savedRecent.assignee || [],
    priority: savedRecent.priority || [],
    status: savedRecent.status || [],
  };
}

let chipIdCounter = 0;

const useSmartSearchStore = create((set, get) => ({
  // Active field selector (left pill)
  activeField: 'all',

  // Text currently in the search input
  searchText: '',

  // Filter chips: [{ id, field, value, label }]
  chips: [],

  // Recent searches (persisted in localStorage)
  recentSearches: savedRecent,

  // Suggestion state
  suggestions: [],
  suggestionsLoading: false,
  showSuggestions: false,
  highlightedSuggestionIndex: -1,

  // Preview
  previewCount: null,

  // Actions
  setActiveField: (field) => set({ activeField: field, searchText: '', showSuggestions: false }),

  setSearchText: (text) => set({ searchText: text }),

  setSuggestions: (suggestions) => set({ suggestions, suggestionsLoading: false }),
  setSuggestionsLoading: (loading) => set({ suggestionsLoading: loading }),
  setShowSuggestions: (show) => set(show ? { showSuggestions: true } : { showSuggestions: false, highlightedSuggestionIndex: -1 }),
  setHighlightedSuggestionIndex: (index) => set({ highlightedSuggestionIndex: index }),

  setPreviewCount: (count) => set({ previewCount: count }),

  addChip: (field, value, label, keepOpen = false) => {
    const { chips } = get();
    // Prevent duplicate chip with same field+value
    const exists = chips.some(c => c.field === field && c.value.toLowerCase() === value.toLowerCase());
    if (exists) return;

    chipIdCounter += 1;
    set({
      chips: [...chips, { id: chipIdCounter, field, value, label: label || value }],
      searchText: '',
      showSuggestions: keepOpen,
    });
  },

  removeChip: (chipId) => {
    set((state) => ({ chips: state.chips.filter(c => c.id !== chipId) }));
  },

  removeLastChip: () => {
    set((state) => {
      if (state.chips.length === 0) return state;
      return { chips: state.chips.slice(0, -1) };
    });
  },

  clearAllChips: () => set({ chips: [], searchText: '', showSuggestions: false, previewCount: null }),

  addRecentSearch: (text, forceField = null) => {
    if (!text || !text.trim()) return;
    const trimmed = text.trim();
    const { recentSearches, activeField } = get();
    const field = forceField || activeField;

    const currentList = recentSearches[field] || [];
    let updated = [trimmed, ...currentList.filter(s => s !== trimmed)];
    
    // limit to 8 for all, 5 for specific fields
    updated = updated.slice(0, field === 'all' ? 8 : 5);

    const newRecent = { ...recentSearches, [field]: updated };
    localStorage.setItem('flowtask_smart_recent', JSON.stringify(newRecent));
    set({ recentSearches: newRecent });
  },

  clearRecentSearches: () => {
    // We clear all fields here and reset to empty structure
    const emptyObject = { all: [], task: [], project: [], assignee: [], priority: [], status: [] };
    localStorage.setItem('flowtask_smart_recent', JSON.stringify(emptyObject));
    set({ recentSearches: emptyObject });
  },

  // Reset everything
  resetAll: () => {
    set({
      activeField: 'all',
      searchText: '',
      chips: [],
      suggestions: [],
      suggestionsLoading: false,
      showSuggestions: false,
      highlightedSuggestionIndex: -1,
      previewCount: null,
    });
  },
}));

export default useSmartSearchStore;
