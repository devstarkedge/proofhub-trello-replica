import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import attachmentService from '../services/attachmentService';

const useAttachmentStore = create(
  devtools(
    subscribeWithSelector((set, get) => ({
      // State
      attachments: {},  // { cardId: attachments[] }
      loading: {},      // { cardId: boolean }
      error: {},        // { cardId: string }
      pagination: {},   // { cardId: { page, totalPages, hasNext, hasPrev } }
      uploadProgress: {}, // { uploadId: { progress, status, fileName } }
      selectedAttachments: [], // For bulk operations

      // Actions
      setAttachments: (cardId, attachments) => set((state) => ({
        attachments: { ...state.attachments, [cardId]: attachments }
      })),

      addAttachment: (cardId, attachment) => set((state) => ({
        attachments: {
          ...state.attachments,
          [cardId]: [attachment, ...(state.attachments[cardId] || [])]
        }
      })),

      addAttachments: (cardId, newAttachments) => set((state) => ({
        attachments: {
          ...state.attachments,
          [cardId]: [...newAttachments, ...(state.attachments[cardId] || [])]
        }
      })),

      removeAttachment: (cardId, attachmentId) => set((state) => ({
        attachments: {
          ...state.attachments,
          [cardId]: (state.attachments[cardId] || []).filter(a => a._id !== attachmentId)
        }
      })),

      removeAttachments: (cardId, attachmentIds) => set((state) => ({
        attachments: {
          ...state.attachments,
          [cardId]: (state.attachments[cardId] || []).filter(a => !attachmentIds.includes(a._id))
        }
      })),

      updateAttachment: (cardId, attachmentId, updates) => set((state) => ({
        attachments: {
          ...state.attachments,
          [cardId]: (state.attachments[cardId] || []).map(a =>
            a._id === attachmentId ? { ...a, ...updates } : a
          )
        }
      })),

      setLoading: (cardId, isLoading) => set((state) => ({
        loading: { ...state.loading, [cardId]: isLoading }
      })),

      setError: (cardId, error) => set((state) => ({
        error: { ...state.error, [cardId]: error }
      })),

      setPagination: (cardId, pagination) => set((state) => ({
        pagination: { ...state.pagination, [cardId]: pagination }
      })),

      setUploadProgress: (uploadId, progress) => set((state) => ({
        uploadProgress: { ...state.uploadProgress, [uploadId]: progress }
      })),

      clearUploadProgress: (uploadId) => set((state) => {
        const newProgress = { ...state.uploadProgress };
        delete newProgress[uploadId];
        return { uploadProgress: newProgress };
      }),

      toggleSelectAttachment: (attachmentId) => set((state) => {
        const isSelected = state.selectedAttachments.includes(attachmentId);
        return {
          selectedAttachments: isSelected
            ? state.selectedAttachments.filter(id => id !== attachmentId)
            : [...state.selectedAttachments, attachmentId]
        };
      }),

      clearSelection: () => set({ selectedAttachments: [] }),

      selectAll: (cardId) => set((state) => ({
        selectedAttachments: (state.attachments[cardId] || []).map(a => a._id)
      })),

      // Async Actions
      fetchAttachments: async (cardId, options = {}) => {
        const { page = 1, limit = 20, fileType, forceRefresh = false } = options;
        const state = get();

        // Return cached if available and not forcing refresh
        if (!forceRefresh && state.attachments[cardId] && !options.page) {
          return state.attachments[cardId];
        }

        set((s) => ({
          loading: { ...s.loading, [cardId]: true },
          error: { ...s.error, [cardId]: null }
        }));

        try {
          const result = await attachmentService.getCardAttachments(cardId, { page, limit, fileType });
          
          set((s) => ({
            attachments: { ...s.attachments, [cardId]: result.data },
            pagination: { ...s.pagination, [cardId]: result.pagination },
            loading: { ...s.loading, [cardId]: false }
          }));

          return result.data;
        } catch (error) {
          set((s) => ({
            loading: { ...s.loading, [cardId]: false },
            error: { ...s.error, [cardId]: error.message }
          }));
          throw error;
        }
      },

      loadMore: async (cardId) => {
        const state = get();
        const pagination = state.pagination[cardId];
        
        if (!pagination?.hasNext) return;

        const nextPage = pagination.currentPage + 1;
        try {
          const result = await attachmentService.getCardAttachments(cardId, { page: nextPage });
          
          set((s) => ({
            attachments: {
              ...s.attachments,
              [cardId]: [...(s.attachments[cardId] || []), ...result.data]
            },
            pagination: { ...s.pagination, [cardId]: result.pagination }
          }));

          return result.data;
        } catch (error) {
          console.error('Load more error:', error);
          throw error;
        }
      },

      uploadFile: async (file, cardId, options = {}) => {
        const uploadId = `${Date.now()}-${file.name}`;
        
        // Create preview URL for immediate display
        let preview = null;
        if (file.type.startsWith('image/')) {
          preview = URL.createObjectURL(file);
        }

        set((s) => ({
          uploadProgress: {
            ...s.uploadProgress,
            [uploadId]: { 
              progress: 0, 
              status: 'uploading', 
              fileName: file.name,
              fileType: file.type.startsWith('image/') ? 'image' : 'file',
              preview,
              preview,
              size: file.size,
              cardId, // Track which card this belongs to
              contextType: options.contextType || 'card',
              contextRef: options.contextRef || cardId
            }
          }
        }));

        try {
          const attachment = await attachmentService.uploadFile(file, cardId, {
            ...options,
            onProgress: (progress) => {
              set((s) => ({
                uploadProgress: {
                  ...s.uploadProgress,
                  [uploadId]: { 
                    ...s.uploadProgress[uploadId],
                    progress 
                  }
                }
              }));
            }
          });

          set((s) => ({
            attachments: {
              ...s.attachments,
              [cardId]: [attachment, ...(s.attachments[cardId] || [])]
            },
            uploadProgress: {
              ...s.uploadProgress,
              [uploadId]: { 
                ...s.uploadProgress[uploadId],
                progress: 100, 
                status: 'completed' 
              }
            }
          }));

          // Clear progress after delay and revoke object URL
          setTimeout(() => {
            const state = get();
            const progress = state.uploadProgress[uploadId];
            if (progress?.preview) {
              URL.revokeObjectURL(progress.preview);
            }
            get().clearUploadProgress(uploadId);
          }, 1000);

          return attachment;
        } catch (error) {
          set((s) => ({
            uploadProgress: {
              ...s.uploadProgress,
              [uploadId]: { 
                ...s.uploadProgress[uploadId],
                status: 'error', 
                error: error.message 
              }
            }
          }));
          throw error;
        }
      },

      uploadMultiple: async (files, cardId, options = {}) => {
        // Handle each file individually to show individual progress bars
        // Start all uploads concurrently without waiting for them to complete
        const uploadIds = [];
        
        // We use map to trigger the async operations but we don't await Promise.all
        // This makes it non-blocking ("fire and forget" from the caller's perspective)
        files.forEach(file => {
          // We can't easily get the uploadId back from the async updateState unless we change uploadFile
          // But uploadFile generates ID deterministically-ish or we can rely on the store update.
          // Better approach: Let's assume the caller will watch the store.
          // Or, we can make uploadFile return the uploadId synchronously if we split it?
          // For now, we'll just trigger them.
           get().uploadFile(file, cardId, options).catch(err => {
             console.error(`Background upload failed for ${file.name}:`, err);
           });
        });
        
        // Return immediately indicating uploads started
        return { success: true, started: true, count: files.length };
      },

      uploadFromPaste: async (imageData, cardId, options = {}) => {
        const uploadId = `paste-${Date.now()}`;
        
        // Convert base64 to blob for preview if needed, or just use base64
        set((s) => ({
          uploadProgress: {
            ...s.uploadProgress,
            [uploadId]: { 
              progress: 50, 
              status: 'uploading', 
              fileName: 'Pasted image',
              fileType: 'image',
              preview: imageData,
              cardId
            }
          }
        }));

        try {
          const attachment = await attachmentService.uploadFromPaste(imageData, cardId, options);

          set((s) => ({
            attachments: {
              ...s.attachments,
              [cardId]: [attachment, ...(s.attachments[cardId] || [])]
            },
            uploadProgress: {
              ...s.uploadProgress,
              [uploadId]: { 
                ...s.uploadProgress[uploadId],
                progress: 100, 
                status: 'completed' 
              }
            }
          }));

          setTimeout(() => get().clearUploadProgress(uploadId), 1000);

          return attachment;
        } catch (error) {
          set((s) => ({
            uploadProgress: {
              ...s.uploadProgress,
              [uploadId]: { 
                ...s.uploadProgress[uploadId],
                status: 'error', 
                error: error.message 
              }
            }
          }));
          throw error;
        }
      },

      deleteAttachment: async (cardId, attachmentId) => {
        try {
          await attachmentService.deleteAttachment(attachmentId);
          get().removeAttachment(cardId, attachmentId);
          return true;
        } catch (error) {
          console.error('Delete attachment error:', error);
          throw error;
        }
      },

      setAsCover: async (cardId, attachmentId) => {
        try {
          const result = await attachmentService.setAsCover(attachmentId);
          // Update all attachments - unset isCover on others, set on this one
          get().updateAttachment(cardId, attachmentId, { isCover: true });
          const currentAttachments = get().attachments[cardId] || [];
          currentAttachments.forEach(att => {
            if (att._id !== attachmentId && att.isCover) {
              get().updateAttachment(cardId, att._id, { isCover: false });
            }
          });
          // Return the full attachment data from the response
          return result?.data || result;
        } catch (error) {
          console.error('Set as cover error:', error);
          throw error;
        }
      },

      deleteSelected: async (cardId) => {
        const state = get();
        const attachmentIds = state.selectedAttachments;
        
        if (attachmentIds.length === 0) return;

        try {
          await attachmentService.deleteMultiple(attachmentIds);
          get().removeAttachments(cardId, attachmentIds);
          get().clearSelection();
          return true;
        } catch (error) {
          console.error('Delete selected error:', error);
          throw error;
        }
      },

      // Selectors
      getAttachments: (cardId) => get().attachments[cardId] || [],
      isLoading: (cardId) => get().loading[cardId] || false,
      getError: (cardId) => get().error[cardId] || null,
      getPagination: (cardId) => get().pagination[cardId] || null,
      getUploadProgress: () => get().uploadProgress,
      getSelectedCount: () => get().selectedAttachments.length,
      isSelected: (attachmentId) => get().selectedAttachments.includes(attachmentId),

      // Clear card data
      clearCardData: (cardId) => set((state) => {
        const newAttachments = { ...state.attachments };
        const newLoading = { ...state.loading };
        const newError = { ...state.error };
        const newPagination = { ...state.pagination };
        
        delete newAttachments[cardId];
        delete newLoading[cardId];
        delete newError[cardId];
        delete newPagination[cardId];

        return {
          attachments: newAttachments,
          loading: newLoading,
          error: newError,
          pagination: newPagination,
          selectedAttachments: []
        };
      }),

      // Handle real-time events
      handleAttachmentAdded: (cardId, attachment) => {
        get().addAttachment(cardId, attachment);
      },

      handleAttachmentDeleted: (cardId, attachmentId) => {
        get().removeAttachment(cardId, attachmentId);
      },

      handleAttachmentsAdded: (cardId, attachments) => {
        get().addAttachments(cardId, attachments);
      },

      handleAttachmentsDeleted: (cardId, attachmentIds) => {
        get().removeAttachments(cardId, attachmentIds);
      }
    })),
    { name: 'attachment-store' }
  )
);

export default useAttachmentStore;
