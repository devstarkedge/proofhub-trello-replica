/**
 * Lightweight and robust backend HTML sanitizer.
 * Defends against XSS, script injection, and attribute-based payload injection
 * prior to persisting rich text (comments, card descriptions) in MongoDB.
 */

export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';

  let clean = html;

  // 1. Remove dangerous executable/embedding elements and their inner content
  const dangerousTags = ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'base'];
  for (const tag of dangerousTags) {
    const regex = new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`, 'gi');
    clean = clean.replace(regex, '');
    // Also remove unclosed/self-closing tags
    const selfClosing = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
    clean = clean.replace(selfClosing, '');
  }

  // 2. Strip all inline event handlers (e.g. onload, onerror, onclick, onmouseover)
  clean = clean.replace(/\s+on[a-z0-9_-]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

  // 3. Neutralize dangerous URL schemes in href, src, action, formaction, data
  clean = clean.replace(/(href|src|action|formaction|data)\s*=\s*(['"]?)\s*(?:javascript:|data:text\/html|vbscript:)/gi, '$1=$2#blocked:');

  return clean;
}

export default sanitizeHtml;
