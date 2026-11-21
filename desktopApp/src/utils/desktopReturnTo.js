export function desktopReturnTo(value) {
  if (typeof value !== 'string' || value.length > 12000 || !value.startsWith('/') ||
      value.startsWith('//') || /[\\\s]/.test(value) || /\p{Cc}/u.test(value)) return null;
  try {
    const url = new URL(value, 'https://navigation.invalid');
    return url.origin === 'https://navigation.invalid' && !['/login', '/register'].includes(url.pathname) ? value : null;
  } catch { return null; }
}
