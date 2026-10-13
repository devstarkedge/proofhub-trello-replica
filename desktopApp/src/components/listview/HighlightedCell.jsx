import React, { memo, useMemo } from 'react';

/**
 * Wraps text content and highlights matching search terms with a <mark> tag.
 * Memoized for performance in large tables.
 *
 * @param {Object}   props
 * @param {string}   props.text       – The text content to display
 * @param {string[]} props.terms      – Array of search terms to highlight
 * @param {string}   [props.className] – Additional className for the container
 */
const HighlightedCell = ({ text, terms, className = '' }) => {
  const highlighted = useMemo(() => {
    if (!text || !terms || terms.length === 0) return null;

    // Build a regex that matches any of the terms (case-insensitive, escaped)
    const escaped = terms
      .filter(Boolean)
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    if (escaped.length === 0) return null;

    const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
    const parts = text.split(regex);

    if (parts.length <= 1) return null;

    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} className="bg-blue-100/80 text-blue-900 rounded-sm px-0.5 font-semibold ring-1 ring-blue-200/50">{part}</mark>
        : <span key={i}>{part}</span>
    );
  }, [text, terms]);

  if (!highlighted) {
    return <span className={className}>{text}</span>;
  }

  return <span className={className}>{highlighted}</span>;
};

export default memo(HighlightedCell);
