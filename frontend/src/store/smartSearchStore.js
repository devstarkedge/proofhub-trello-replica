import { create } from 'zustand';

let chipIdCounter = 0;

const useSmartSearchStore = create((set, get) => ({
  // Active field selector (left pill)
  activeField: 'all',

  // Text currently in the search input
  searchText: '',

  // Filter chips: [{ id, field, value, label }]
  chips: [],

  // Recent searches (persisted in localStorage)
  recentSearches: JSON.parse(localStorage.getItem('flowtask_smart_recent') || '[]').slice(0, 10),

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

  addChip: (field, value, label) => {
    const { chips } = get();
    // Prevent duplicate chip with same field+value
    const exists = chips.some(c => c.field === field && c.value.toLowerCase() === value.toLowerCase());
    if (exists) return;

    chipIdCounter += 1;
    set({
      chips: [...chips, { id: chipIdCounter, field, value, label: label || value }],
      searchText: '',
      showSuggestions: false,
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

  addRecentSearch: (text) => {
    if (!text || !text.trim()) return;
    const trimmed = text.trim();
    const { recentSearches } = get();
    const updated = [trimmed, ...recentSearches.filter(s => s !== trimmed)].slice(0, 10);
    localStorage.setItem('flowtask_smart_recent', JSON.stringify(updated));
    set({ recentSearches: updated });
  },

  clearRecentSearches: () => {
    localStorage.removeItem('flowtask_smart_recent');
    set({ recentSearches: [] });
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
