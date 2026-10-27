import DOMPurify from 'dompurify';

/**
 * Universal HTML Sanitizer using DOMPurify
 * Defends against XSS (Stored & Reflected) while preserving rich text formatting,
 * TipTap editor output, mentions, and safe embedded images.
 */

// Configure DOMPurify hooks once
if (typeof window !== 'undefined' && DOMPurify.isSupported) {
  // Ensure external links always open in a new tab with security attributes
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
    // Constrain inline images
    if (node.tagName === 'IMG') {
      node.style.maxWidth = '100%';
      node.style.height = 'auto';
      if (!node.getAttribute('loading')) {
        node.setAttribute('loading', 'lazy');
      }
    }
  });
}

export default function sanitizeHtml(dirtyHtml, options = {}) {
  if (!dirtyHtml || typeof dirtyHtml !== 'string') return '';

  if (typeof window === 'undefined' || !DOMPurify.isSupported) {
    // Basic fallback for non-DOM environments
    return dirtyHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/\s+on\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');
  }

  const defaultOptions = {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote', 'code', 'pre',
      'a', 'img', 'span', 'div',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'hr'
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'style',
      'width', 'height', 'data-type', 'data-id', 'data-label', 'data-username'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    ...options
  };

  return DOMPurify.sanitize(dirtyHtml, defaultOptions);
}
