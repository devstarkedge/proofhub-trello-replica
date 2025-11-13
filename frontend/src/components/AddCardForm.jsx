import React, { useState, memo } from 'react';
import { X } from 'lucide-react';

const AddCardForm = memo(({ listId, onAdd, onCancel }) => {
  const [title, setTitle] = useState('');
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (title.trim()) {
      onAdd(listId, title.trim());
      setTitle('');
    }
  };
  
  return (
    <div className="bg-white rounded-lg p-2 shadow-sm">
      <textarea
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          } else if (e.key === 'Escape') {
            onCancel();
          }
        }}
        placeholder="Enter a title for this card..."
        className="w-full p-2 text-sm border-none outline-none resize-none"
        rows="3"
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={handleSubmit}
          className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
        >
          Add card
        </button>
        <button
          onClick={onCancel}
          className="text-gray-600 hover:text-gray-800"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}

);

export default AddCardForm;
