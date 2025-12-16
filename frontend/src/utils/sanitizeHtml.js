// Simple client-side sanitizer that strips scripts/styles and disables interactive elements
export default function sanitizeHtml(dirtyHtml) {
  if (!dirtyHtml) return '';

  // Create a container to parse the HTML
  const container = document.createElement('div');
  container.innerHTML = dirtyHtml;

  // Remove dangerous elements
  const removeSelectors = ['script', 'style', 'link', 'iframe', 'object', 'embed'];
  removeSelectors.forEach(sel => {
    const nodes = container.querySelectorAll(sel);
    nodes.forEach(n => n.remove());
  });

  // Walk all elements and sanitize attributes
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, null, false);
  const toProcess = [];
  while (walker.nextNode()) toProcess.push(walker.currentNode);

  toProcess.forEach(el => {
    // Remove inline event handlers
    [...el.attributes].forEach(attr => {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    });

    // Remove inline styles to avoid layout breakage
    if (el.hasAttribute('style')) el.removeAttribute('style');

    // Disable interactive elements so preview is read-only
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'button' || tag === 'textarea' || tag === 'select' || tag === 'option') {
      try {
        el.setAttribute('disabled', 'true');
        el.setAttribute('aria-disabled', 'true');
        // For inputs/textarea preserve value by making them read-only if possible
        if (tag === 'input' || tag === 'textarea') el.setAttribute('readonly', 'true');
      } catch (e) {
        // ignore
      }
    }

    // For anchors, remove href to prevent navigation
    if (tag === 'a') {
      el.removeAttribute('href');
      el.removeAttribute('target');
      el.setAttribute('role', 'text');
    }

    // Ensure images are constrained
    if (tag === 'img') {
      el.style.maxWidth = '100%';
      el.style.height = 'auto';
      el.setAttribute('loading', 'lazy');
    }
  });

  // Wrap sanitized content in a predictable container with reset styles
  const wrapper = document.createElement('div');
  wrapper.className = 'version-preview sanitized-content';
  wrapper.style.wordBreak = 'break-word';
  wrapper.style.maxWidth = '100%';
  wrapper.style.boxSizing = 'border-box';
  wrapper.innerHTML = container.innerHTML;

  return wrapper.innerHTML;
}
