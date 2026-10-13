import React, { useState } from 'react';
import Database from '../services/database';
import Card from '../components/Card';

const Search = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const searchResults = await Database.search(query);
      setResults(searchResults);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-100">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-8">Search Tasks</h1>

        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search tasks, assignees, or tags..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {results.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Results ({results.length})</h2>
            {results.map(card => (
              <div key={card._id} className="bg-white rounded-lg shadow p-4">
                <Card card={card} onClick={() => {}} compact />
              </div>
            ))}
          </div>
        )}

        {query && !loading && results.length === 0 && (
          <div className="text-center text-gray-500">
            No results found for "{query}"
          </div>
        )}
      </div>
    </div>
  );
};

export default Search;
