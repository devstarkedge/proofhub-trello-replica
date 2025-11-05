import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Quote, Undo, Redo } from 'lucide-react';

const RichTextEditor = ({ content, onChange, placeholder = "Add a more detailed description...", className = "" }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[60px] p-3 border border-gray-300 rounded-lg transition-all duration-200 ${
          isExpanded ? 'min-h-[200px]' : 'min-h-[60px]'
        } ${className}`,
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '');
    }
  }, [content, editor]);

  const handleFocus = () => {
    setIsExpanded(true);
  };

  const handleBlur = () => {
    // Only collapse if there's no content
    if (!editor?.getText().trim()) {
      setIsExpanded(false);
    }
  };

  if (!editor) {
    return null;
  }

  return (
    <div className="w-full">
      {/* Toolbar - only show when expanded */}
      {isExpanded && (
        <div className="flex items-center gap-1 mb-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('bold') ? 'bg-gray-200' : ''
            }`}
            title="Bold"
          >
            <Bold size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('italic') ? 'bg-gray-200' : ''
            }`}
            title="Italic"
          >
            <Italic size={16} />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('bulletList') ? 'bg-gray-200' : ''
            }`}
            title="Bullet List"
          >
            <List size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('orderedList') ? 'bg-gray-200' : ''
            }`}
            title="Numbered List"
          >
            <ListOrdered size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('blockquote') ? 'bg-gray-200' : ''
            }`}
            title="Quote"
          >
            <Quote size={16} />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <button
            onClick={() => editor.chain().focus().undo().run()}
            className="p-2 rounded hover:bg-gray-200 transition-colors"
            disabled={!editor.can().undo()}
            title="Undo"
          >
            <Undo size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().redo().run()}
            className="p-2 rounded hover:bg-gray-200 transition-colors"
            disabled={!editor.can().redo()}
            title="Redo"
          >
            <Redo size={16} />
          </button>
        </div>
      )}

      {/* Editor Content */}
      <div
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="w-full"
      >
        <EditorContent
          editor={editor}
          placeholder={placeholder}
          className="w-full"
        />
      </div>

      {/* Placeholder when collapsed and empty */}
      {!isExpanded && !editor.getText().trim() && (
        <div
          className="absolute inset-0 flex items-center p-3 text-gray-500 cursor-text pointer-events-none"
          onClick={() => {
            setIsExpanded(true);
            editor?.commands.focus();
          }}
        >
          {placeholder}
        </div>
      )}
    </div>
  );
};

export default RichTextEditor;
