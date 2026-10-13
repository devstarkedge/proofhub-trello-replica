import { useState, useEffect } from 'react';

// Returns debounced value - can be destructured as array or used directly
export function useDebounce(value, delay = 200) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  // Return as array for destructuring compatibility [debouncedValue]
  const result = [debouncedValue];
  result.value = debouncedValue; // Also allow direct access
  return result;
}
