import { createProjectSearchIndex, searchProjectIndex } from '../utils/projectSearch';

let index = [], version = 0;
const cache = new Map();
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'index') {
      index = createProjectSearchIndex(data.departments);
      version = data.version;
      cache.clear();
      return;
    }
    if (data.version !== version) return;
    let result = cache.get(data.query);
    if (!result) {
      result = searchProjectIndex(index, data.query);
      if (cache.size >= 32) cache.delete(cache.keys().next().value);
      cache.set(data.query, result);
    }
    self.postMessage({ ...data, result });
  } catch {
    self.postMessage({ ...data, error: true });
  }
};
