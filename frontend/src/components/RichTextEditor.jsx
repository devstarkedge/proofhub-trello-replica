import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import EmojiPicker from 'emoji-picker-react';
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
  Paperclip,
  Type,
  Undo,
  Redo,
  Loader,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Smile
} from 'lucide-react';
import MentionList from './MentionList';
import useEditorAttachment from '../hooks/useEditorAttachment';
import useEditorAttachmentSync from '../hooks/useEditorAttachmentSync';
import EditorAttachmentPreview from './EditorAttachmentPreview';
import InlineAttachmentManager from './InlineAttachmentManager';
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
  onImageUpload = null, // Legacy callback when image is uploaded (for backward compatibility)
  isComment = false, // Is this editor for comments?
  mentionContainer = document.body, // Container for mention popup
  modalContainerRef = null, // Ref to the modal container for click-outside detection
  collapsible = false, // Whether the editor is collapsible (used in modals)
  // New props for Cloudinary attachment integration
  cardId = null, // Legacy Card ID (for backward compatibility)
  entityType = 'card', // 'card' | 'subtask' | 'nanoSubtask'
  entityId = null, // The entity ID (replaces cardId for generic support)
  contextType = null, // 'description' or 'comment'
  contextRef = null, // Reference ID
  enableAttachments = false, // Enable multi-file attachment button
  enableAutoCover = true, // Auto-set first description image as cover
  showLinkTool = true,
  showImageTool = true,
  editorMinHeightClass = null,
}) => {
  const [isExpanded, setIsExpanded] = useState(startExpanded);
  // ... state declarations ...
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
  const emojiPickerRef = useRef(null);
  const emojiButtonRef = useRef(null);

  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const editorInstanceRef = useRef(null);

  // Helper to determine if we have a valid entity for attachments
  const hasEntityContext = !!(entityId || cardId);

  const getEditorSizeClass = useCallback(() => {
    if (collapsible && !isExpanded) {
      return 'h-[50px] overflow-hidden';
    }
    if (editorMinHeightClass) {
      return editorMinHeightClass;
    }
    return isComment ? 'min-h-[80px]' : 'min-h-[200px]';
  }, [collapsible, isExpanded, editorMinHeightClass, isComment]);

  // Callback to insert image into editor with proper cursor positioning
  // Images are inserted at the current position, then cursor moves to new line below
  const handleInsertImage = useCallback((imageUrl) => {
    const editor = editorInstanceRef.current;
    if (!editor) return;

    // Get current selection position
    const { from, to } = editor.state.selection;
    
    // Check if there's any content after the cursor position
    const docEnd = editor.state.doc.content.size;
    const hasContentAfter = to < docEnd - 1;
    
    // Insert the image
    editor.chain()
      .focus()
      .setImage({ src: imageUrl })
      .run();
    
    // Move cursor to a new line after the image
    // This creates a cleaner UX where text typed after upload appears below the image
    setTimeout(() => {
      if (editor && !editor.isDestroyed) {
        editor.chain()
          .focus()
          .createParagraphNear()
          .run();
      }
    }, 10);
  }, []);

  // Callback to insert file preview into editor with new line
  const handleInsertFile = useCallback((html) => {
    const editor = editorInstanceRef.current;
    if (!editor) return;
    
    editor.chain()
      .focus()
      .insertContent(html)
      .run();
    
    // Move cursor to new line after the file preview
    setTimeout(() => {
      if (editor && !editor.isDestroyed) {
        editor.chain()
          .focus()
          .createParagraphNear()
          .run();
      }
    }, 10);
  }, []);

  // Initialize useEditorAttachment hook for Cloudinary integration
  const {
    uploading: attachmentUploading,
    error: attachmentError,
    success: attachmentSuccess,
    uploadFile: uploadAttachmentFile,
    uploadFiles: uploadAttachmentFiles,
    uploadFromPaste: uploadAttachmentFromPaste,
    validateFile,
    getAcceptedFileTypes
  } = useEditorAttachment({
    entityType,
    entityId: entityId || cardId,
    // Legacy support handled by hook, but explicit passing helps clarity
    cardId: cardId,
    contextType: contextType || (isComment ? 'comment' : 'description'),
    contextRef,
    onInsertImage: handleInsertImage,
    onInsertFile: handleInsertFile,
    enableAutoCover
  });

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
          const mentionType = node.attrs.type || 'user';
          
          // Different styling for different mention types
          const typeClasses = {
            user: 'mention text-blue-600 font-semibold no-underline hover:text-blue-700',
            role: 'mention text-purple-600 font-semibold no-underline hover:text-purple-700',
            team: 'mention text-teal-600 font-semibold no-underline hover:text-teal-700'
          };
          
          return [
            'a',
            {
              class: typeClasses[mentionType] || typeClasses.user,
              'data-id': id,
              'data-type': mentionType,
              href: `#${id}`
            },
            `@${label}`
          ];
        },
        suggestion: {
          items: ({ query }) => {
            const q = (query || '').toLowerCase();
            const usersData = usersRef.current;
            // Ensure usersList is always an array
            const usersList = Array.isArray(usersData) ? usersData : [];
            const results = [];
            
            // Filter and add users
            const matchedUsers = usersList
              .filter(user => user && user.name && user.name.toLowerCase().includes(q))
              .slice(0, 6)
              .map(user => ({ 
                id: String(user._id || user.id || ''), 
                label: user.name,
                avatar: user.avatar,
                type: 'user'
              }));
            results.push(...matchedUsers);
            
            // Note: roles and teams can be added if usersData has .roles and .teams properties
            // This is handled in CommentSystem.jsx with the mentionData object
            if (usersData && usersData.roles) {
              const rolesList = usersData.roles;
              const matchedRoles = rolesList
                .filter(role => role && role.name && role.name.toLowerCase().includes(q))
                .slice(0, 2)
                .map(role => ({
                  id: String(role._id || role.id || ''),
                  label: role.name,
                  type: 'role'
                }));
              results.push(...matchedRoles);
            }
            
            if (usersData && usersData.teams) {
              const teamsList = usersData.teams;
              const matchedTeams = teamsList
                .filter(team => team && team.name && team.name.toLowerCase().includes(q))
                .slice(0, 2)
                .map(team => ({
                  id: String(team._id || team.id || ''),
                  label: team.name,
                  type: 'team'
                }));
              results.push(...matchedTeams);
            }
            
            return results.slice(0, 8);
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
                  zIndex: 9999,
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
                // Guard against destroying already-destroyed instances
                if (popup) {
                  popup.forEach(p => {
                    if (p && p.destroy && !p.state?.isDestroyed) {
                      p.destroy();
                    }
                  });
                  popup = null;
                }
                if (component && component.destroy) {
                  component.destroy();
                  component = null;
                }
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
          class: `prose prose-sm max-w-none focus:outline-none transition-all duration-200 ease-in-out ${getEditorSizeClass()}`,
        },
      },
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        onChange(html);
      },
    }, [getEditorSizeClass]);

  // Sync editor content with attachment deletions
  // When an attachment is deleted from any section, remove it from editor content
  useEditorAttachmentSync({
    editor,
    entityType,
    entityId: entityId || cardId,
    onChange
  });

  // Update editor attributes when isExpanded changes
  useEffect(() => {
    if (editor) {
      editor.setOptions({
        editorProps: {
          attributes: {
            class: `prose prose-sm max-w-none focus:outline-none transition-all duration-200 ease-in-out ${getEditorSizeClass()}`,
          },
        },
      });
    }
  }, [editor, getEditorSizeClass]);

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '');
    }
  }, [content, editor]);

  // Store editor instance in ref for attachment hook callbacks
  useEffect(() => {
    editorInstanceRef.current = editor;
  }, [editor]);

  // Handle clicking outside emoji picker
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  const handleEmojiClick = (emojiData) => {
    if (editor) {
      editor.chain().focus().insertContent(emojiData.emoji).run();
      setShowEmojiPicker(false);
    }
  };

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

  // Handle paste events for images from clipboard
  const handlePaste = useCallback(async (event) => {
    const clipboardItems = event.clipboardData?.items;
    if (!clipboardItems) return;

    for (const item of clipboardItems) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        
        const file = item.getAsFile();
        if (!file) continue;

        // Validate file size
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
          setUploadError('Pasted image must be less than 10MB');
          setTimeout(() => setUploadError(null), 3000);
          return;
        }

        setUploadingImage(true);
        setUploadError(null);
        setUploadSuccess(false);

        try {
          // Use new Cloudinary attachment upload if valid entity context is available
          if (hasEntityContext && enableAttachments) {
            await uploadAttachmentFile(file);
            setUploadSuccess(true);
            setTimeout(() => setUploadSuccess(false), 2000);
          } else if (onImageUpload) {
            // Legacy: use provided callback
            const formData = new FormData();
            formData.append('image', file, `pasted-image-${Date.now()}.${file.type.split('/')[1] || 'png'}`);
            const imageUrl = await onImageUpload(formData);
            if (imageUrl) {
              editor.chain().focus().setImage({ src: imageUrl }).run();
              setUploadSuccess(true);
              setTimeout(() => setUploadSuccess(false), 2000);
            }
          } else {
            // Fallback to base64 for preview
            const reader = new FileReader();
            reader.onload = (e) => {
              editor.chain().focus().setImage({ src: e.target.result }).run();
              setUploadSuccess(true);
              setTimeout(() => setUploadSuccess(false), 2000);
            };
            reader.readAsDataURL(file);
          }
        } catch (error) {
          console.error('Paste image upload failed:', error);
          setUploadError('Failed to upload pasted image');
          setTimeout(() => setUploadError(null), 3000);
        } finally {
          setUploadingImage(false);
        }
        return; // Only process the first image
      }
    }
  }, [editor, onImageUpload, hasEntityContext, enableAttachments, uploadAttachmentFile]);

  // Attach paste handler to editor
  useEffect(() => {
    const editorElement = editorRef.current;
    if (editorElement) {
      editorElement.addEventListener('paste', handlePaste);
      return () => {
        editorElement.removeEventListener('paste', handlePaste);
      };
    }
  }, [handlePaste]);

  if (!editor) {
    return null;
  }

  return (
    <div ref={editorRef} className={`w-full relative ${className}`}>
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
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`p-2 rounded hover:bg-gray-200 transition-colors ${
                editor.isActive('bold') ? 'bg-gray-200' : ''
              }`}
              title="Bold"
            >
              <Bold size={16} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('italic') ? 'bg-gray-200' : ''
            }`}
            title="Italic"
          >
            <Italic size={16} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('underline') ? 'bg-gray-200' : ''
            }`}
            title="Underline"
          >
            <UnderlineIcon size={16} />
          </button>
          {showLinkTool && <div className="w-px h-6 bg-gray-300 mx-1" />}
          {showLinkTool && (
            <button
              type="button"
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
          )}
          <button
            ref={emojiButtonRef}
            type="button"
            onClick={() => {
              if (!showEmojiPicker) {
                // Calculate position before showing
                const btn = emojiButtonRef.current;
                if (btn) {
                  const rect = btn.getBoundingClientRect();
                  // Default to bottom
                  let top = rect.bottom + 5;
                  let left = rect.left;
                  
                  // Check if it fits below (approx height 450px)
                  if (top + 450 > window.innerHeight) {
                    // Place above
                    top = rect.top - 450 - 5;
                  }
                  
                  setPickerPosition({ top, left });
                }
              }
              setShowEmojiPicker(!showEmojiPicker);
            }}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              showEmojiPicker ? 'bg-gray-200' : ''
            }`}
            title="Insert Emoji"
          >
            <Smile size={16} />
            {showEmojiPicker && (
              <div 
                ref={emojiPickerRef} 
                className="fixed z-[9999] shadow-2xl rounded-lg border border-gray-200 bg-white"
                style={{ 
                  top: `${pickerPosition.top}px`, 
                  left: `${pickerPosition.left}px` 
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
                  width={300}
                  height={400}
                  previewConfig={{ showPreview: false }}
                  lazyLoadEmojis={true}
                />
              </div>
            )}
          </button>
          {showImageTool && (
            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.click();
                }
              }}
              disabled={uploadingImage || attachmentUploading}
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
          )}
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

              if (file.size > 10 * 1024 * 1024) { // 10MB limit
                setUploadError('Image must be less than 10MB');
                setTimeout(() => setUploadError(null), 3000);
                return;
              }

              setUploadingImage(true);
              setUploadError(null);
              setUploadSuccess(false);

              try {
                // Use Cloudinary upload if entity context is available
                if (hasEntityContext && enableAttachments) {
                  // Fire and forget upload (handled by store/preview)
                  uploadAttachmentFile(file).catch(console.error);
                  
                  // Show success briefly
                  setUploadSuccess(true);
                  setTimeout(() => setUploadSuccess(false), 2000);
                } else if (onImageUpload) {
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
          {/* Multi-file Attachment Button - only show when enableAttachments is true */}
          {enableAttachments && hasEntityContext && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (attachmentInputRef.current) {
                    attachmentInputRef.current.click();
                  }
                }}
                disabled={attachmentUploading || uploadingImage}
                className="p-2 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed relative"
                title="Attach Files (PDF, Word, Excel, etc.)"
              >
                {attachmentUploading ? (
                  <Loader size={16} className="animate-spin" />
                ) : attachmentSuccess ? (
                  <Check size={16} className="text-green-600" />
                ) : attachmentError ? (
                  <AlertCircle size={16} className="text-red-600" />
                ) : (
                  <Paperclip size={16} />
                )}
              </button>
              <input
                ref={attachmentInputRef}
                type="file"
                accept={getAcceptedFileTypes()}
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) return;

                  try {
                    // Fire and forget - store handles progress
                    uploadAttachmentFiles(files);
                  } catch (error) {
                    console.error('Attachment upload failed:', error);
                  } finally {
                    // Reset file input
                    if (attachmentInputRef.current) {
                      attachmentInputRef.current.value = '';
                    }
                  }
                }}
              />
            </>
          )}
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('bulletList') ? 'bg-gray-200' : ''
            }`}
            title="Bullet List"
          >
            <List size={16} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('orderedList') ? 'bg-gray-200' : ''
            }`}
            title="Numbered List"
          >
            <ListOrdered size={16} />
          </button>
          <button
            type="button"
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
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            className="p-2 rounded hover:bg-gray-200 transition-colors"
            disabled={!editor.can().undo()}
            title="Undo"
          >
            <Undo size={16} />
          </button>
          <button
            type="button"
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



        {/* Inline Attachment Manager - Shows uploaded attachments with delete capability */}
        {hasEntityContext && enableAttachments && isExpanded && (
          <div className="px-3 pb-1 border-t border-gray-100">
            <InlineAttachmentManager
              entityType={entityType}
              entityId={entityId || cardId}
              contextType={contextType || (isComment ? 'comment' : 'description')}
              contextRef={contextRef}
              isExpanded={isExpanded}
            />
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
          max-width: 200px;
          max-height: 200px;
          width: auto;
          height: auto;
          border-radius: 8px;
          display: inline-block;
          margin: 8px 4px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
          cursor: pointer;
          object-fit: cover;
        }
        .ProseMirror img:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          transform: scale(1.02);
        }
        .ProseMirror p {
          margin: 1px 0;
          line-height: 1.4;
        }
        .ProseMirror ul {
          list-style-type: disc;
          padding-left: 24px;
          margin: 2px 0;
        }
        .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 24px;
          margin: 2px 0;
        }
        .ProseMirror li {
          margin: 0;
          line-height: 1.4;
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
        /* Inline attachment styles */
        .inline-attachment {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          background-color: #f3f4f6;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          user-select: none;
          transition: all 0.15s ease;
        }
        .inline-attachment:hover {
          background-color: #e5e7eb;
          border-color: #d1d5db;
        }
        .inline-attachment[data-type="pdf"] {
          background-color: #fef2f2;
          border-color: #fecaca;
        }
        .inline-attachment[data-type="pdf"]:hover {
          background-color: #fee2e2;
        }
        .inline-attachment[data-type="document"] {
          background-color: #eff6ff;
          border-color: #bfdbfe;
        }
        .inline-attachment[data-type="document"]:hover {
          background-color: #dbeafe;
        }
        .inline-attachment[data-type="spreadsheet"] {
          background-color: #f0fdf4;
          border-color: #bbf7d0;
        }
        .inline-attachment[data-type="spreadsheet"]:hover {
          background-color: #dcfce7;
        }
        .inline-attachment-icon {
          font-size: 14px;
        }
        .inline-attachment-name {
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
};

export default RichTextEditor;
