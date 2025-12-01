// Advanced Search Utility for ListView
// Supports field-specific searches, operators, fuzzy matching, and more

export class AdvancedSearch {
  constructor() {
    this.searchHistory = [];
    this.maxHistorySize = 10;
    this.fuzzyThreshold = 0.6; // Similarity threshold for fuzzy search
  }

  // Parse search query into structured tokens
  parseQuery(query) {
    if (!query || query.trim() === '') {
      return { tokens: [], isEmpty: true };
    }

    const tokens = [];
    const words = query.split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Handle quoted phrases
      if (word.startsWith('"') && !word.endsWith('"')) {
        let phrase = word;
        i++;
        while (i < words.length && !words[i].endsWith('"')) {
          phrase += ' ' + words[i];
          i++;
        }
        if (i < words.length) {
          phrase += ' ' + words[i];
        }
        tokens.push({
          type: 'phrase',
          value: phrase.slice(1, -1), // Remove quotes
          field: null,
          operator: 'AND'
        });
        continue;
      }

      // Handle field-specific searches (field:value)
      if (word.includes(':')) {
        const [field, ...valueParts] = word.split(':');
        const value = valueParts.join(':');

        if (value.startsWith('"') && value.endsWith('"')) {
          // Quoted field value
          tokens.push({
            type: 'field',
            field: field.toLowerCase(),
            value: value.slice(1, -1),
            operator: 'AND'
          });
        } else {
          tokens.push({
            type: 'field',
            field: field.toLowerCase(),
            value: value,
            operator: 'AND'
          });
        }
        continue;
      }

      // Handle operators
      if (word.toUpperCase() === 'AND' || word.toUpperCase() === 'OR' || word.toUpperCase() === 'NOT') {
        // Apply operator to next token
        if (i + 1 < words.length) {
          tokens.push({
            type: 'operator',
            value: word.toUpperCase()
          });
        }
        continue;
      }

      // Regular search term
      tokens.push({
        type: 'term',
        value: word,
        field: null,
        operator: 'AND'
      });
    }

    // Set operators for tokens
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'operator') {
        if (i + 1 < tokens.length) {
          tokens[i + 1].operator = tokens[i].value;
        }
        tokens.splice(i, 1);
        i--;
      }
    }

    return { tokens, isEmpty: false };
  }

  // Calculate Levenshtein distance for fuzzy search
  levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }

  // Calculate similarity score
  similarity(str1, str2) {
    if (str1 === str2) return 1;
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;
    const distance = this.levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    return 1 - distance / maxLen;
  }

  // Fuzzy search in text
  fuzzySearch(text, query, threshold = this.fuzzyThreshold) {
    if (!text || !query) return false;

    const words = text.toLowerCase().split(/\s+/);
    const queryWords = query.toLowerCase().split(/\s+/);

    for (const queryWord of queryWords) {
      let found = false;
      for (const word of words) {
        if (this.similarity(word, queryWord) >= threshold) {
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
    return true;
  }

  // Search in specific field
  searchInField(card, field, value, isFuzzy = false) {
    const getNestedValue = (obj, path) => {
      return path.split('.').reduce((current, key) => {
        if (current && typeof current === 'object') {
          if (Array.isArray(current)) {
            return current.map(item => item?.[key]).filter(Boolean);
          }
          return current[key];
        }
        return null;
      }, obj);
    };

    const fieldValue = getNestedValue(card, field);

    if (!fieldValue) return false;

    if (Array.isArray(fieldValue)) {
      return fieldValue.some(item => {
        const str = typeof item === 'string' ? item : item?.name || item?.title || String(item);
        return isFuzzy ? this.fuzzySearch(str, value) : str.toLowerCase().includes(value.toLowerCase());
      });
    }

    const str = typeof fieldValue === 'string' ? fieldValue : fieldValue?.name || fieldValue?.title || String(fieldValue);
    return isFuzzy ? this.fuzzySearch(str, value) : str.toLowerCase().includes(value.toLowerCase());
  }

  // Main search function
  search(cards, query, options = {}) {
    const {
      fuzzy = false,
      caseSensitive = false,
      highlight = false
    } = options;

    const parsed = this.parseQuery(query);
    if (parsed.isEmpty) return cards;

    // Add to search history
    if (query.trim()) {
      this.addToHistory(query);
    }

    const results = [];
    const highlights = new Map();

    for (const card of cards) {
      let matches = [];
      let cardHighlights = [];

      for (const token of parsed.tokens) {
        let tokenMatches = false;

        if (token.type === 'field') {
          // Field-specific search
          tokenMatches = this.searchInField(card, token.field, token.value, fuzzy);
          if (tokenMatches && highlight) {
            cardHighlights.push({
              field: token.field,
              value: token.value,
              type: 'field'
            });
          }
        } else if (token.type === 'phrase') {
          // Exact phrase search
          const searchableText = this.getCardSearchableText(card);
          tokenMatches = searchableText.toLowerCase().includes(token.value.toLowerCase());
          if (tokenMatches && highlight) {
            cardHighlights.push({
              text: token.value,
              type: 'phrase'
            });
          }
        } else if (token.type === 'term') {
          // General term search
          tokenMatches = this.searchCard(card, token.value, fuzzy);
          if (tokenMatches && highlight) {
            cardHighlights.push({
              text: token.value,
              type: 'term'
            });
          }
        }

        matches.push({
          operator: token.operator,
          matches: tokenMatches
        });
      }

      // Evaluate boolean logic
      const finalMatch = this.evaluateBooleanLogic(matches);

      if (finalMatch) {
        results.push(card);
        if (highlight && cardHighlights.length > 0) {
          highlights.set(card._id, cardHighlights);
        }
      }
    }

    return highlight ? { results, highlights } : results;
  }

  // Evaluate boolean logic for search tokens
  evaluateBooleanLogic(matches) {
    if (matches.length === 0) return false;
    if (matches.length === 1) return matches[0].matches;

    let result = matches[0].matches;

    for (let i = 1; i < matches.length; i++) {
      const { operator, matches: tokenMatches } = matches[i];

      switch (operator) {
        case 'AND':
          result = result && tokenMatches;
          break;
        case 'OR':
          result = result || tokenMatches;
          break;
        case 'NOT':
          result = result && !tokenMatches;
          break;
        default:
          result = result && tokenMatches;
      }
    }

    return result;
  }

  // Search across all relevant card fields
  searchCard(card, query, fuzzy = false) {
    const searchableFields = [
      'title',
      'description',
      'board.name',
      'list.title',
      'assignees.name',
      'labels',
      'priority',
      'status'
    ];

    for (const field of searchableFields) {
      if (this.searchInField(card, field, query, fuzzy)) {
        return true;
      }
    }

    return false;
  }

  // Get all searchable text from a card
  getCardSearchableText(card) {
    const texts = [];

    if (card.title) texts.push(card.title);
    if (card.description) texts.push(card.description);
    if (card.board?.name) texts.push(card.board.name);
    if (card.list?.title) texts.push(card.list.title);
    if (card.assignees) {
      card.assignees.forEach(assignee => {
        if (assignee.name) texts.push(assignee.name);
      });
    }
    if (card.labels) texts.push(...card.labels);
    if (card.priority) texts.push(card.priority);
    if (card.status) texts.push(card.status);

    return texts.join(' ');
  }

  // Add query to search history
  addToHistory(query) {
    const existingIndex = this.searchHistory.indexOf(query);
    if (existingIndex > -1) {
      this.searchHistory.splice(existingIndex, 1);
    }

    this.searchHistory.unshift(query);

    if (this.searchHistory.length > this.maxHistorySize) {
      this.searchHistory = this.searchHistory.slice(0, this.maxHistorySize);
    }
  }

  // Get search suggestions based on current query
  getSuggestions(query, cards) {
    if (!query || query.length < 2) return [];

    const suggestions = new Set();
    const queryLower = query.toLowerCase();

    for (const card of cards) {
      const text = this.getCardSearchableText(card);
      const words = text.toLowerCase().split(/\s+/);

      for (const word of words) {
        if (word.startsWith(queryLower) && word !== queryLower) {
          suggestions.add(word);
        }
      }
    }

    return Array.from(suggestions).slice(0, 5);
  }

  // Get popular search terms
  getPopularSearches() {
    return [...this.searchHistory];
  }

  // Clear search history
  clearHistory() {
    this.searchHistory = [];
  }
}

// Debounce utility
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Highlight search terms in text
export function highlightText(text, highlights, className = 'bg-yellow-200') {
  if (!text || !highlights || highlights.length === 0) return text;

  let highlightedText = text;

  for (const highlight of highlights) {
    if (highlight.type === 'phrase' || highlight.type === 'term') {
      const regex = new RegExp(`(${highlight.text})`, 'gi');
      highlightedText = highlightedText.replace(regex, `<mark class="${className}">$1</mark>`);
    }
  }

  return highlightedText;
}