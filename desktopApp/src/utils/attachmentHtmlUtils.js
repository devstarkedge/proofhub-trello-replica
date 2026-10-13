/**
 * Utility functions for handling attachments in HTML content
 * Used to sync attachment deletions with description/comment content
 */

/**
 * Remove images with a specific URL from HTML content
 * @param {string} html - The HTML content
 * @param {string} imageUrl - The URL of the image to remove
 * @returns {string} - The cleaned HTML content
 */
export const removeImageFromHtml = (html, imageUrl) => {
  if (!html || !imageUrl) return html;
  
  // Create a temporary DOM element to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Find all images
  const images = tempDiv.querySelectorAll('img');
  let hasChanges = false;
  
  images.forEach(img => {
    const src = img.getAttribute('src') || '';
    // Check for URL match (exact or partial for Cloudinary transformed URLs)
    if (src === imageUrl || src.includes(imageUrl) || imageUrl.includes(src)) {
      // Remove the image element
      img.remove();
      hasChanges = true;
    }
  });
  
  // Also check for inline attachment spans
  const attachmentSpans = tempDiv.querySelectorAll('.inline-attachment');
  attachmentSpans.forEach(span => {
    const dataUrl = span.getAttribute('data-url') || '';
    if (dataUrl === imageUrl || dataUrl.includes(imageUrl) || imageUrl.includes(dataUrl)) {
      span.remove();
      hasChanges = true;
    }
  });
  
  if (hasChanges) {
    // Clean up empty paragraphs left behind
    const paragraphs = tempDiv.querySelectorAll('p');
    paragraphs.forEach(p => {
      if (!p.textContent.trim() && p.querySelectorAll('img, .inline-attachment').length === 0) {
        // Keep at least one empty paragraph for the editor
        if (p.previousElementSibling || p.nextElementSibling) {
          p.remove();
        }
      }
    });
    
    return tempDiv.innerHTML;
  }
  
  return html;
};

/**
 * Check if HTML content contains a specific image URL
 * @param {string} html - The HTML content
 * @param {string} imageUrl - The URL to check for
 * @returns {boolean} - Whether the URL exists in the content
 */
export const htmlContainsImage = (html, imageUrl) => {
  if (!html || !imageUrl) return false;
  
  // Simple string check first (faster)
  if (html.includes(imageUrl)) return true;
  
  // For Cloudinary URLs, check for the base image ID
  const cloudinaryMatch = imageUrl.match(/\/([^/]+)\.[a-z]+$/i);
  if (cloudinaryMatch && cloudinaryMatch[1]) {
    return html.includes(cloudinaryMatch[1]);
  }
  
  return false;
};

/**
 * Extract all image URLs from HTML content
 * @param {string} html - The HTML content
 * @returns {string[]} - Array of image URLs
 */
export const extractImageUrls = (html) => {
  if (!html) return [];
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  const urls = [];
  
  // Get img src attributes
  const images = tempDiv.querySelectorAll('img');
  images.forEach(img => {
    const src = img.getAttribute('src');
    if (src) urls.push(src);
  });
  
  // Get data-url from inline attachments
  const attachmentSpans = tempDiv.querySelectorAll('.inline-attachment');
  attachmentSpans.forEach(span => {
    const dataUrl = span.getAttribute('data-url');
    if (dataUrl) urls.push(dataUrl);
  });
  
  return urls;
};

/**
 * Sanitize HTML to ensure proper paragraph structure after modifications
 * @param {string} html - The HTML content
 * @returns {string} - Properly structured HTML
 */
export const sanitizeEditorHtml = (html) => {
  if (!html || html === '<p></p>') return '<p></p>';
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Ensure there's at least one paragraph
  if (!tempDiv.querySelector('p')) {
    const p = document.createElement('p');
    while (tempDiv.firstChild) {
      p.appendChild(tempDiv.firstChild);
    }
    tempDiv.appendChild(p);
  }
  
  return tempDiv.innerHTML || '<p></p>';
};

export default {
  removeImageFromHtml,
  htmlContainsImage,
  extractImageUrls,
  sanitizeEditorHtml
};
