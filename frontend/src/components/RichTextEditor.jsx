import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import tippy from 'tippy.js';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  Link as LinkIcon,
  ListOrdered,
  Quote,
  Image as ImageIcon,
  Type,
  Undo,
  Redo
} from 'lucide-react';
import MentionList from './MentionList';
import 'tippy.js/dist/tippy.css';

const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      height: { default: null },
      objectFit: { default: 'contain' },
    };
  },
});

const RichTextEditor = ({
  content,
  onChange,
  placeholder = "Add a more detailed description...",
  className = "",
  users = [],
  startExpanded = false,
  allowMentions = true,
  onImageUpload = null, // Callback when image is uploaded
  isComment = false, // Is this editor for comments?
  mentionContainer = document.body, // Container for mention popup
}) => {
  const [isExpanded, setIsExpanded] = useState(startExpanded || isComment);
  const editorRef = useRef(null);

  // keep a ref to the users so suggestion items can access latest list without
  // re-creating the editor/extensions when users update asynchronously
  const usersRef = useRef(users || []);
  useEffect(() => {
    usersRef.current = users || [];
  }, [users]);

  // Handle clicking outside to collapse
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (editorRef.current && !editorRef.current.contains(event.target)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded]);

  const mentionExtension = allowMentions
    ? Mention.configure({
        HTMLAttributes: { class: 'mention' },
        renderHTML: ({ node, HTMLAttributes }) => {
          const id = node.attrs.id || '';
          const label = node.attrs.label || '';
          return [
            'a',
            {
              class: 'mention text-blue-600 font-semibold no-underline',
              'data-id': id,
              href: `#${id}`
            },
            `@${label}`
          ];
        },
        suggestion: {
          items: ({ query }) => {
            const q = (query || '').toLowerCase();
            const list = usersRef.current || [];
            return list
              .filter(user => user && user.name && user.name.toLowerCase().includes(q))
              .slice(0, 6)
              .map(user => ({ id: String(user._id || user.id || ''), label: user.name }));
          },
          render: () => {
            let component;
            let popup;

            return {
              onStart: props => {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });

                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => mentionContainer,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                  animation: 'shift-away',
                });
              },
              onUpdate(props) {
                component && component.updateProps && component.updateProps(props);
                popup && popup[0] && popup[0].setProps({ getReferenceClientRect: props.clientRect });
              },
              onKeyDown(props) {
                if (component && component.ref && component.ref.onKeyDown) {
                  return component.ref.onKeyDown(props.event);
                }
                return false;
              },
              onExit() {
                if (popup) popup.forEach(p => p.destroy && p.destroy());
                if (component) component.destroy();
              }
            };
          }
        }
      })
    : null;

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          link: false,
          underline: false,
        }),
        Underline,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-blue-600 hover:text-blue-800 underline',
          },
        }),
        CustomImage.configure({
          allowBase64: true,
          inline: true,
        }),
        ...(mentionExtension ? [mentionExtension] : []),
      ],
      content: content || '',
      editorProps: {
        attributes: {
          class: `prose prose-sm max-w-none focus:outline-none ${
            !isExpanded ? (isComment ? 'h-[60px]' : 'h-[120px]') : 'min-h-[200px]'
          }`,
        },
      },
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        onChange(html);
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
    // Keep expanded once focused to allow formatting before typing
  };

  if (!editor) {
    return null;
  }

  return (
    <div ref={editorRef} className="w-full relative">
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
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('underline') ? 'bg-gray-200' : ''
            }`}
            title="Underline"
          >
            <UnderlineIcon size={16} />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <button
            onClick={() => {
              const previousUrl = editor.getAttributes('link').href;
              const url = window.prompt('URL', previousUrl);

              if (url === null) {
                return;
              }

              if (url === '') {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
                return;
              }

              // If no text is selected, use the URL as the link text
              if (editor.state.selection.empty) {
                editor.chain().focus().insertContent(`<a href="${url}" target="_blank">${url}</a>`).run();
              } else {
                editor.chain().focus().extendMarkRange('link').setLink({ href: url, target: '_blank' }).run();
              }
            }}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('link') ? 'bg-gray-200' : ''
            }`}
            title="Link"
          >
            <LinkIcon size={16} />
          </button>
          <button
            onClick={async () => {
              if (onImageUpload) {
                // Use file input for upload
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = async (e) => {
                  const file = e.target.files[0];
                  if (file) {
                    try {
                      const formData = new FormData();
                      formData.append('image', file);
                      const imageUrl = await onImageUpload(formData);
                      if (imageUrl) {
                        editor.chain().focus().setImage({ src: imageUrl }).run();
                      }
                    } catch (error) {
                      console.error('Image upload failed:', error);
                      // Fallback to URL input
                      const url = prompt('Enter image URL');
                      if (url) {
                        editor.chain().focus().setImage({ src: url }).run();
                      }
                    }
                  }
                };
                input.click();
              } else {
                // Fallback to URL input
                const url = prompt('Enter image URL');
                if (url) {
                  editor.chain().focus().setImage({ src: url }).run();
                }
              }
            }}
            className="p-2 rounded hover:bg-gray-200 transition-colors"
            title="Image"
          >
            <ImageIcon size={16} />
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
