import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';

/**
 * HtmlContent - A component for safely rendering HTML content with proper styling
 * 
 * Features:
 * - DOMPurify sanitization to prevent XSS attacks
 * - Tailwind prose classes for beautiful typography
 * - Links open in new tabs with proper security attributes
 * - Images display with proper sizing
 * - Support for headings, bold text, lists, etc.
 */
const HtmlContent = ({ 
  html, 
  className = '',
  maxHeight = null,
  allowImages = true,
  allowLinks = true 
}) => {
  // Sanitize and process HTML
  const sanitizedHtml = useMemo(() => {
    if (!html) return '';
    
    // Configure DOMPurify
    const config = {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'strike', 's',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li',
        'blockquote', 'pre', 'code',
        'a', 'img', 'span', 'div',
        'table', 'thead', 'tbody', 'tr', 'th', 'td'
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'class', 'style',
        'target', 'rel', 'width', 'height'
      ],
      // Add hooks for link processing
      ADD_ATTR: ['target', 'rel']
    };
    
    // Remove images if not allowed
    if (!allowImages) {
      config.FORBID_TAGS = ['img'];
    }
    
    // Remove links if not allowed
    if (!allowLinks) {
      config.FORBID_TAGS = [...(config.FORBID_TAGS || []), 'a'];
    }
    
    // Sanitize the HTML
    let clean = DOMPurify.sanitize(html, config);
    
    // Process links to open in new tabs
    if (allowLinks) {
      // Add target="_blank" and rel="noopener noreferrer" to all links
      clean = clean.replace(
        /<a\s+([^>]*href\s*=\s*["'][^"']*["'][^>]*)>/gi,
        (match, attrs) => {
          // Check if target is already set
          if (!attrs.includes('target=')) {
            attrs += ' target="_blank"';
          }
          // Check if rel is already set
          if (!attrs.includes('rel=')) {
            attrs += ' rel="noopener noreferrer"';
          }
          return `<a ${attrs}>`;
        }
      );
    }
    
    return clean;
  }, [html, allowImages, allowLinks]);

  if (!html) {
    return null;
  }

  return (
    <div 
      className={`
        html-content
        prose prose-sm max-w-none
        prose-headings:font-semibold prose-headings:text-gray-900
        prose-h1:text-xl prose-h1:mb-3 prose-h1:mt-4
        prose-h2:text-lg prose-h2:mb-2 prose-h2:mt-3
        prose-h3:text-base prose-h3:mb-2 prose-h3:mt-2
        prose-p:text-gray-700 prose-p:leading-relaxed prose-p:my-2
        prose-strong:text-gray-900 prose-strong:font-semibold
        prose-em:text-gray-700
        prose-a:text-blue-600 prose-a:underline prose-a:hover:text-blue-800
        prose-ul:list-disc prose-ul:pl-5 prose-ul:my-2
        prose-ol:list-decimal prose-ol:pl-5 prose-ol:my-2
        prose-li:text-gray-700 prose-li:my-1
        prose-blockquote:border-l-4 prose-blockquote:border-gray-300 
        prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-gray-600
        prose-pre:bg-gray-100 prose-pre:rounded-lg prose-pre:p-3 prose-pre:overflow-x-auto
        prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
        prose-img:max-w-full prose-img:h-auto prose-img:rounded-lg prose-img:my-2
        ${maxHeight ? 'overflow-y-auto' : ''}
        ${className}
      `}
      style={maxHeight ? { maxHeight } : undefined}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
};

export default HtmlContent;
