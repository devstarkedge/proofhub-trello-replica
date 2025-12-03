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
  Redo,
  Loader,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight
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
  modalContainerRef = null, // Ref to the modal container for click-outside detection
  collapsible = false, // Whether the editor is collapsible (used in modals)
}) => {
  const [isExpanded, setIsExpanded] = useState(startExpanded);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  // keep a ref to the users so suggestion items can access latest list without
  // re-creating the editor/extensions when users update asynchronously
  const usersRef = useRef(users || []);
  useEffect(() => {
    usersRef.current = users || [];
  }, [users]);

  // Handle clicking outside to collapse (scoped to modal if provided)
  useEffect(() => {
    if (!collapsible) return;
    
    const handleClickOutside = (event) => {
      // Don't collapse if clicking inside the editor
      if (editorRef.current && editorRef.current.contains(event.target)) {
        return;
      }
      
      // If modal container is provided, only collapse if click is within the modal but outside the editor
      if (modalContainerRef?.current) {
        if (modalContainerRef.current.contains(event.target)) {
          setIsExpanded(false);
        }
      } else {
        // Fallback: collapse on any outside click
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      // Use a small delay to prevent immediate collapse on the same click that expands
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded, collapsible, modalContainerRef]);

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
          class: `prose prose-sm max-w-none focus:outline-none transition-all duration-200 ease-in-out ${
            collapsible && !isExpanded 
              ? 'h-[50px] overflow-hidden' 
              : isComment 
                ? 'min-h-[80px]' 
                : 'min-h-[200px]'
          }`,
        },
      },
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        onChange(html);
      },
    });

  // Update editor attributes when isExpanded changes
  useEffect(() => {
    if (editor) {
      editor.setOptions({
        editorProps: {
          attributes: {
            class: `prose prose-sm max-w-none focus:outline-none transition-all duration-200 ease-in-out ${
              collapsible && !isExpanded 
                ? 'h-[50px] overflow-hidden' 
                : isComment 
                  ? 'min-h-[80px]' 
                  : 'min-h-[200px]'
            }`,
          },
        },
      });
    }
  }, [isExpanded, collapsible, isComment, editor]);

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

  const handleExpandClick = () => {
    setIsExpanded(true);
    editor?.commands.focus();
  };

  if (!editor) {
    return null;
  }

  return (
    <div ref={editorRef} className="w-full relative">
      {/* Collapsed Header - show when collapsible and not expanded */}
      {collapsible && !isExpanded && (
        <div 
          onClick={handleExpandClick}
          className="flex items-center gap-2 p-3 cursor-pointer hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors"
        >
          <ChevronRight size={16} className="text-gray-400" />
          <span className="text-gray-500 text-sm">
            {editor.getText().trim() ? 'Click to expand...' : placeholder}
          </span>
        </div>
      )}

      {/* Expanded Editor */}
      <div className={`transition-all duration-200 ease-in-out ${collapsible && !isExpanded ? 'hidden' : ''}`}>
        {/* Toolbar - only show when expanded */}
        {isExpanded && (
          <div className="flex items-center gap-1 mb-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
            {collapsible && (
              <>
                <div className="flex items-center gap-1 text-gray-400 mr-2">
                  <ChevronDown size={16} />
                </div>
                <div className="w-px h-6 bg-gray-300 mx-1" />
              </>
            )}
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
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.click();
              }
            }}
            disabled={uploadingImage}
            className="p-2 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed relative"
            title="Upload Image"
          >
            {uploadingImage ? (
              <Loader size={16} className="animate-spin" />
            ) : uploadSuccess ? (
              <Check size={16} className="text-green-600" />
            ) : uploadError ? (
              <AlertCircle size={16} className="text-red-600" />
            ) : (
              <ImageIcon size={16} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;

              // Validate file
              if (!file.type.startsWith('image/')) {
                setUploadError('Please select a valid image file');
                setTimeout(() => setUploadError(null), 3000);
                return;
              }

              if (file.size > 5 * 1024 * 1024) { // 5MB limit
                setUploadError('Image must be less than 5MB');
                setTimeout(() => setUploadError(null), 3000);
                return;
              }

              setUploadingImage(true);
              setUploadError(null);
              setUploadSuccess(false);

              try {
                if (onImageUpload) {
                  const formData = new FormData();
                  formData.append('image', file);
                  const imageUrl = await onImageUpload(formData);
                  if (imageUrl) {
                    editor.chain().focus().setImage({ src: imageUrl }).run();
                    setUploadSuccess(true);
                    setTimeout(() => setUploadSuccess(false), 2000);
                  }
                } else {
                  // Fallback to URL input
                  const url = prompt('Enter image URL');
                  if (url) {
                    editor.chain().focus().setImage({ src: url }).run();
                    setUploadSuccess(true);
                    setTimeout(() => setUploadSuccess(false), 2000);
                  }
                }
              } catch (error) {
                console.error('Image upload failed:', error);
                setUploadError('Failed to upload image');
                setTimeout(() => setUploadError(null), 3000);
              } finally {
                setUploadingImage(false);
                // Reset file input
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }
            }}
          />
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

        {/* Placeholder when not collapsible and collapsed and empty */}
        {!collapsible && !isExpanded && !editor.getText().trim() && (
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

        {/* Upload Status Messages */}
        {uploadError && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}
        {uploadSuccess && (
          <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
            <Check size={16} className="flex-shrink-0" />
            <span>Image uploaded successfully</span>
          </div>
        )}
      </div>

      <style>{`
        .ProseMirror {
          padding: 12px;
        }
        .ProseMirror img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          display: block;
          margin: 16px 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          transition: box-shadow 0.3s ease;
        }
        .ProseMirror img:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .ProseMirror p {
          margin: 8px 0;
        }
        .ProseMirror ul, .ProseMirror ol {
          padding-left: 24px;
          margin: 8px 0;
        }
        .ProseMirror li {
          margin: 4px 0;
        }
        .ProseMirror blockquote {
          border-left: 4px solid #cbd5e1;
          padding-left: 12px;
          margin: 8px 0;
          color: #64748b;
          font-style: italic;
        }
        .ProseMirror a {
          color: #0066cc;
          text-decoration: underline;
        }
        .ProseMirror a:hover {
          color: #0052a3;
        }
        .ProseMirror code {
          background-color: #f3f4f6;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          font-size: 0.9em;
        }
        .ProseMirror pre {
          background-color: #1f2937;
          color: #f3f4f6;
          padding: 12px;
          border-radius: 6px;
          overflow-x: auto;
          margin: 8px 0;
        }
        .ProseMirror pre code {
          background-color: transparent;
          color: inherit;
          padding: 0;
        }
        .mention {
          background-color: #dbeafe;
          color: #0066cc;
          padding: 0 4px;
          border-radius: 3px;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};

export default RichTextEditor;
