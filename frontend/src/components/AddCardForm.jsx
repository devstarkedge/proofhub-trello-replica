import React, { useState, memo, useRef, useEffect } from 'react';
import { X, Plus, Sparkles } from 'lucide-react';

const AddCardForm = memo(({ listId, onAdd, onCancel }) => {
  const [title, setTitle] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef(null);
  
  // Auto-focus and auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [title]);
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (title.trim()) {
      onAdd(listId, title.trim());
      setTitle('');
    }
  };

  const isValid = title.trim().length > 0;
  
  return (
    <div 
      className="relative overflow-hidden rounded-xl transition-all duration-300 ease-out"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.9) 100%)',
        boxShadow: isFocused 
          ? '0 8px 32px rgba(139, 92, 246, 0.15), 0 0 0 2px rgba(139, 92, 246, 0.3), inset 0 1px 0 rgba(255,255,255,0.8)'
          : '0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Subtle gradient accent line at top */}
      <div 
        className="absolute top-0 left-0 right-0 h-0.5 transition-opacity duration-300"
        style={{
          background: 'linear-gradient(90deg, #8B5CF6 0%, #EC4899 50%, #F59E0B 100%)',
          opacity: isFocused ? 1 : 0.4,
        }}
      />
      
      <div className="p-3">
        {/* Textarea container */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              } else if (e.key === 'Escape') {
                onCancel();
              }
            }}
            placeholder="What needs to be done?"
            className="w-full text-sm text-gray-800 placeholder-gray-400 bg-transparent resize-none outline-none transition-all duration-200"
            style={{
              minHeight: '44px',
              lineHeight: '1.5',
              fontWeight: 500,
            }}
            rows="1"
          />
          
          {/* Character hint */}
          {title.length > 0 && (
            <div 
              className="absolute right-0 bottom-0 text-[10px] font-medium transition-opacity duration-200"
              style={{ color: title.length > 100 ? '#EF4444' : '#9CA3AF' }}
            >
              {title.length}/100
            </div>
          )}
        </div>
        
        {/* Actions bar */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100/80">
          <div className="flex items-center gap-2">
            {/* Add card button */}
            <button
              onClick={handleSubmit}
              disabled={!isValid}
              className="group relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 overflow-hidden"
              style={{
                background: isValid 
                  ? 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)'
                  : 'linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%)',
                color: isValid ? 'white' : '#9CA3AF',
                boxShadow: isValid 
                  ? '0 2px 8px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                  : 'none',
                transform: isValid ? 'translateY(0)' : 'translateY(0)',
                cursor: isValid ? 'pointer' : 'not-allowed',
              }}
            >
              {/* Hover gradient overlay */}
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{
                  background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
                }}
              />
              
              <Plus size={14} className="relative z-10" strokeWidth={2.5} />
              <span className="relative z-10">Add Card</span>
              
              {/* Sparkle effect when valid */}
              {isValid && (
                <Sparkles 
                  size={12} 
                  className="relative z-10 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:rotate-12" 
                />
              )}
            </button>
            
            {/* Quick tip */}
            <span className="text-[10px] text-gray-400 font-medium hidden sm:inline">
              Press Enter ↵
            </span>
          </div>
          
          {/* Cancel button */}
          <button
            onClick={onCancel}
            className="group flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 hover:bg-gray-100"
            title="Cancel (Esc)"
          >
            <X 
              size={16} 
              className="text-gray-400 group-hover:text-gray-600 transition-colors duration-200" 
              strokeWidth={2}
            />
          </button>
        </div>
      </div>
    </div>
  );
});

// Add display name for debugging
AddCardForm.displayName = 'AddCardForm';

export default AddCardForm;
