import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import tippy from 'tippy.js';
import { Bold, Italic, List, ListOrdered, Quote, Undo, Redo } from 'lucide-react';
import MentionList from './MentionList';

const RichTextEditor = ({
  content,
  onChange,
  placeholder = "Add a more detailed description...",
  className = "",
  users = [], // list of users to suggest for mentions
  startExpanded = false,
  allowMentions = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Configure mention extension
  const mentionExt = allowMentions
    ? Mention.configure({
        HTMLAttributes: { class: 'mention' },
        renderHTML: (node, HTMLAttributes) => {
          // Render mention as anchor with data-id for backend parsing
          const id = HTMLAttributes.id || node.attrs.id || node.attrs.label;
          const label = node.attrs.label || '';
          return [`a`, { class: 'mention text-blue-600 font-semibold', 'data-id': node.attrs.id, href: `#${node.attrs.id || ''}` }, `@${label}`];
        },
        suggestion: {
          char: '@',
          startOfLine: false,
          command: ({ editor, range, props }) => {
            editor.chain().focus().insertContentAt(range, [
              {
                type: 'mention',
                attrs: props,
              },
              { type: 'text', text: ' ' },
            ]).run();
          },
          items: ({ query }) => {
            if (!users || users.length === 0) return [];
            const suggestions = users
              .filter(u => u._id && u.name && (!query || u.name.toLowerCase().includes(query.toLowerCase())))
              .map(u => ({ 
                id: u._id.toString(), // Ensure ID is a string
                label: u.name 
              }))
              .slice(0, 6);
            return suggestions;
          },
          render: () => {
            let component;
            let popup;

            return {
              onStart: (props) => {
                component = new ReactRenderer(MentionList, { props });
                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                });
                // expose keyboard handler
                if (component.ref) component.ref.onKeyDown = (event) => component.ref && component.ref.onKeyDown && component.ref.onKeyDown(event);
              },
              onUpdate(props) {
                component.updateProps(props);
                if (popup && popup[0]) popup[0].setProps({ getReferenceClientRect: props.clientRect });
              },
              onKeyDown(props) {
                // forward keydown to component if exists
                if (component && component.ref && component.ref.onKeyDown) {
                  return component.ref.onKeyDown(props.event);
                }
                return false;
              },
              onExit() {
                if (popup) {
                  popup.forEach(p => p.destroy && p.destroy());
                }
                if (component) {
                  component.destroy();
                }
              }
            };
          }
        }
      })
    : null;

  const extensions = mentionExt ? [StarterKit, mentionExt] : [StarterKit];

  const editor = useEditor({
    extensions,
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
    <div className="w-full relative">
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
          className="absolute top-0 left-0 right-0 bottom-0 flex items-start p-3 text-gray-500 cursor-text pointer-events-none"
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
