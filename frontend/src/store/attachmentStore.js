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
        
        set((s) => ({
          uploadProgress: {
            ...s.uploadProgress,
            [uploadId]: { progress: 0, status: 'uploading', fileName: file.name }
          }
        }));

        try {
          const attachment = await attachmentService.uploadFile(file, cardId, {
            ...options,
            onProgress: (progress) => {
              set((s) => ({
                uploadProgress: {
                  ...s.uploadProgress,
                  [uploadId]: { progress, status: 'uploading', fileName: file.name }
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
              [uploadId]: { progress: 100, status: 'completed', fileName: file.name }
            }
          }));

          // Clear progress after delay
          setTimeout(() => get().clearUploadProgress(uploadId), 2000);

          return attachment;
        } catch (error) {
          set((s) => ({
            uploadProgress: {
              ...s.uploadProgress,
              [uploadId]: { progress: 0, status: 'error', fileName: file.name, error: error.message }
            }
          }));
          throw error;
        }
      },

      uploadMultiple: async (files, cardId, options = {}) => {
        const uploadId = `batch-${Date.now()}`;
        
        set((s) => ({
          uploadProgress: {
            ...s.uploadProgress,
            [uploadId]: { progress: 0, status: 'uploading', fileName: `${files.length} files` }
          }
        }));

        try {
          const result = await attachmentService.uploadMultiple(files, cardId, options);

          if (result.uploaded?.length > 0) {
            set((s) => ({
              attachments: {
                ...s.attachments,
                [cardId]: [...result.uploaded, ...(s.attachments[cardId] || [])]
              }
            }));
          }

          set((s) => ({
            uploadProgress: {
              ...s.uploadProgress,
              [uploadId]: { 
                progress: 100, 
                status: 'completed', 
                fileName: `${result.uploaded?.length || 0} of ${files.length} files`,
                failed: result.failed
              }
            }
          }));

          setTimeout(() => get().clearUploadProgress(uploadId), 3000);

          return result;
        } catch (error) {
          set((s) => ({
            uploadProgress: {
              ...s.uploadProgress,
              [uploadId]: { progress: 0, status: 'error', fileName: `${files.length} files`, error: error.message }
            }
          }));
          throw error;
        }
      },

      uploadFromPaste: async (imageData, cardId, options = {}) => {
        const uploadId = `paste-${Date.now()}`;
        
        set((s) => ({
          uploadProgress: {
            ...s.uploadProgress,
            [uploadId]: { progress: 50, status: 'uploading', fileName: 'Pasted image' }
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
              [uploadId]: { progress: 100, status: 'completed', fileName: 'Pasted image' }
            }
          }));

          setTimeout(() => get().clearUploadProgress(uploadId), 2000);

          return attachment;
        } catch (error) {
          set((s) => ({
            uploadProgress: {
              ...s.uploadProgress,
              [uploadId]: { progress: 0, status: 'error', fileName: 'Pasted image', error: error.message }
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

      setAsCover: async (cardId, attachmentId) => {
        try {
          await attachmentService.setAsCover(attachmentId);
          
          // Update all attachments to remove cover from others
          set((s) => ({
            attachments: {
              ...s.attachments,
              [cardId]: (s.attachments[cardId] || []).map(a => ({
                ...a,
                isCover: a._id === attachmentId
              }))
            }
          }));

          return true;
        } catch (error) {
          console.error('Set cover error:', error);
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
