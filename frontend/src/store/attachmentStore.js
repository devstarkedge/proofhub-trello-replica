import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import attachmentService from '../services/attachmentService';

// Helper to generate composite key for entity-based state management
const getEntityKey = (entityType, entityId) => `${entityType}:${entityId}`;

const useAttachmentStore = create(
  devtools(
    subscribeWithSelector((set, get) => ({
      // State - now keyed by composite key (entityType:entityId)
      attachments: {},  // { 'card:123': attachments[], 'subtask:456': attachments[] }
      loading: {},      // { 'card:123': boolean }
      error: {},        // { 'card:123': string }
      pagination: {},   // { 'card:123': { page, totalPages, hasNext, hasPrev } }
      uploadProgress: {}, // { uploadId: { progress, status, fileName, entityKey } }
      selectedAttachments: [], // For bulk operations

      // Actions - updated to use entityKey
      setAttachments: (entityKey, attachments) => set((state) => ({
        attachments: { ...state.attachments, [entityKey]: attachments }
      })),

      addAttachment: (entityKey, attachment) => set((state) => {
        const current = state.attachments[entityKey] || [];
        if (current.some(a => a._id === attachment._id)) return {};
        return {
          attachments: {
            ...state.attachments,
            [entityKey]: [attachment, ...current]
          }
        };
      }),

      addAttachments: (entityKey, newAttachments) => set((state) => {
        const current = state.attachments[entityKey] || [];
        const uniqueNew = newAttachments.filter(n => !current.some(c => c._id === n._id));
        if (uniqueNew.length === 0) return {};
        return {
          attachments: {
            ...state.attachments,
            [entityKey]: [...uniqueNew, ...current]
          }
        };
      }),

      removeAttachment: (entityKey, attachmentId) => set((state) => ({
        attachments: {
          ...state.attachments,
          [entityKey]: (state.attachments[entityKey] || []).filter(a => a._id !== attachmentId)
        }
      })),

      removeAttachments: (entityKey, attachmentIds) => set((state) => ({
        attachments: {
          ...state.attachments,
          [entityKey]: (state.attachments[entityKey] || []).filter(a => !attachmentIds.includes(a._id))
        }
      })),

      updateAttachment: (entityKey, attachmentId, updates) => set((state) => ({
        attachments: {
          ...state.attachments,
          [entityKey]: (state.attachments[entityKey] || []).map(a =>
            a._id === attachmentId ? { ...a, ...updates } : a
          )
        }
      })),

      setLoading: (entityKey, isLoading) => set((state) => ({
        loading: { ...state.loading, [entityKey]: isLoading }
      })),

      setError: (entityKey, error) => set((state) => ({
        error: { ...state.error, [entityKey]: error }
      })),

      setPagination: (entityKey, pagination) => set((state) => ({
        pagination: { ...state.pagination, [entityKey]: pagination }
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

      selectAll: (entityKey) => set((state) => ({
        selectedAttachments: (state.attachments[entityKey] || []).map(a => a._id)
      })),

      // Async Actions - updated for entity-based fetching
      fetchAttachments: async (entityType, entityId, options = {}) => {
        const entityKey = getEntityKey(entityType, entityId);
        const { page = 1, limit = 20, fileType, forceRefresh = false } = options;
        const state = get();

        // Return cached if available and not forcing refresh
        if (!forceRefresh && state.attachments[entityKey] && !options.page) {
          return state.attachments[entityKey];
        }

        set((s) => ({
          loading: { ...s.loading, [entityKey]: true },
          error: { ...s.error, [entityKey]: null }
        }));

        try {
          const result = await attachmentService.getAttachmentsByEntity(entityType, entityId, { page, limit, fileType });
          
          set((s) => ({
            attachments: { ...s.attachments, [entityKey]: result.data },
            pagination: { ...s.pagination, [entityKey]: result.pagination },
            loading: { ...s.loading, [entityKey]: false }
          }));

          return result.data;
        } catch (error) {
          set((s) => ({
            loading: { ...s.loading, [entityKey]: false },
            error: { ...s.error, [entityKey]: error.message }
          }));
          throw error;
        }
      },

      loadMore: async (entityType, entityId) => {
        const entityKey = getEntityKey(entityType, entityId);
        const state = get();
        const pagination = state.pagination[entityKey];
        
        if (!pagination?.hasNext) return;

        const nextPage = pagination.currentPage + 1;
        try {
          const result = await attachmentService.getAttachmentsByEntity(entityType, entityId, { page: nextPage });
          
          set((s) => ({
            attachments: {
              ...s.attachments,
              [entityKey]: [...(s.attachments[entityKey] || []), ...result.data]
            },
            pagination: { ...s.pagination, [entityKey]: result.pagination }
          }));

          return result.data;
        } catch (error) {
          console.error('Load more error:', error);
          throw error;
        }
      },

      uploadFile: async (file, entityType, entityId, options = {}) => {
        const entityKey = getEntityKey(entityType, entityId);
        // Use existing ID if retrying, otherwise generate new
        const uploadId = options.existingUploadId || `${Date.now()}-${file.name}`;
        
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
              size: file.size,
              entityType,
              entityId,
              entityKey,
              contextType: options.contextType,
              contextRef: options.contextRef,
              file // Store file object for retry capability
            }
          }
        }));

        try {
          const attachment = await attachmentService.uploadFile(file, entityId, {
            ...options,
            entityType,
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

          set((s) => {
            const current = s.attachments[entityKey] || [];
            const exists = current.some(a => a._id === attachment._id);
            const updatedList = exists
              ? current.map(a => a._id === attachment._id ? attachment : a)
              : [attachment, ...current];

            return {
              attachments: {
                ...s.attachments,
                [entityKey]: updatedList
              },
              uploadProgress: {
                ...s.uploadProgress,
                [uploadId]: { 
                  ...s.uploadProgress[uploadId],
                  progress: 100, 
                  status: 'completed' 
                }
              }
            };
          });

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

      uploadMultiple: async (files, entityType, entityId, options = {}) => {
        // Handle each file individually to show individual progress bars
        files.forEach(file => {
          get().uploadFile(file, entityType, entityId, options).catch(err => {
            console.error(`Background upload failed for ${file.name}:`, err);
          });
        });
        
        // Return immediately indicating uploads started
        return { success: true, started: true, count: files.length };
      },

      retryUpload: (uploadId) => {
        const state = get();
        const item = state.uploadProgress[uploadId];
        if (!item || !item.file) return;

        // Reset status to uploading immediately
        set((s) => ({
          uploadProgress: {
            ...s.uploadProgress,
            [uploadId]: { 
              ...item, 
              status: 'uploading', 
              error: null, 
              progress: 0 
            }
          }
        }));
        
        // Retrigger upload with existing ID
        get().uploadFile(item.file, item.entityType, item.entityId, {
            contextType: item.contextType,
            contextRef: item.contextRef,
            existingUploadId: uploadId,
            // Preserve original options if we stored them, or default
        }).catch(err => {
             console.error("Retry failed", err);
        });
      },

      uploadFromPaste: async (imageData, entityType, entityId, options = {}) => {
        const entityKey = getEntityKey(entityType, entityId);
        const uploadId = `paste-${Date.now()}`;
        
        set((s) => ({
          uploadProgress: {
            ...s.uploadProgress,
            [uploadId]: { 
              progress: 50, 
              status: 'uploading', 
              fileName: 'Pasted image',
              fileType: 'image',
              preview: imageData,
              entityType,
              entityId,
              entityKey
            }
          }
        }));

        try {
          const attachment = await attachmentService.uploadFromPaste(imageData, entityId, {
            ...options,
            entityType
          });

          set((s) => {
            const current = s.attachments[entityKey] || [];
            const exists = current.some(a => a._id === attachment._id);
            const updatedList = exists
              ? current.map(a => a._id === attachment._id ? attachment : a)
              : [attachment, ...current];

            return {
              attachments: {
                ...s.attachments,
                [entityKey]: updatedList
              },
              uploadProgress: {
                ...s.uploadProgress,
                [uploadId]: { 
                  ...s.uploadProgress[uploadId],
                  progress: 100, 
                  status: 'completed' 
                }
              }
            };
          });

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

      deleteAttachment: async (entityType, entityId, attachmentId) => {
        const entityKey = getEntityKey(entityType, entityId);
        try {
          await attachmentService.deleteAttachment(attachmentId);
          get().removeAttachment(entityKey, attachmentId);
          return true;
        } catch (error) {
          // If 404/Not Found, allow removal from UI to fix synchronization
          if (error.message && (error.message.toLowerCase().includes('not found') || error.message.includes('404'))) {
             console.warn('Attachment not found on server, removing from UI:', attachmentId);
             get().removeAttachment(entityKey, attachmentId);
             return true;
          }
          console.error('Delete attachment error:', error);
          throw error;
        }
      },

      setAsCover: async (entityType, entityId, attachmentId) => {
        const entityKey = getEntityKey(entityType, entityId);
        try {
          const result = await attachmentService.setAsCover(attachmentId);
          // Update all attachments - unset isCover on others, set on this one
          get().updateAttachment(entityKey, attachmentId, { isCover: true });
          const currentAttachments = get().attachments[entityKey] || [];
          currentAttachments.forEach(att => {
            if (att._id !== attachmentId && att.isCover) {
              get().updateAttachment(entityKey, att._id, { isCover: false });
            }
          });
          // Return the full attachment data from the response
          return result?.data || result;
        } catch (error) {
          console.error('Set as cover error:', error);
          throw error;
        }
      },

      deleteSelected: async (entityType, entityId) => {
        const entityKey = getEntityKey(entityType, entityId);
        const state = get();
        const attachmentIds = state.selectedAttachments;
        
        if (attachmentIds.length === 0) return;

        try {
          await attachmentService.deleteMultiple(attachmentIds);
          get().removeAttachments(entityKey, attachmentIds);
          get().clearSelection();
          return true;
        } catch (error) {
          console.error('Delete selected error:', error);
          throw error;
        }
      },

      // Selectors - updated for entity-based access
      getAttachments: (entityType, entityId) => {
        const entityKey = getEntityKey(entityType, entityId);
        return get().attachments[entityKey] || [];
      },
      isLoading: (entityType, entityId) => {
        const entityKey = getEntityKey(entityType, entityId);
        return get().loading[entityKey] || false;
      },
      getError: (entityType, entityId) => {
        const entityKey = getEntityKey(entityType, entityId);
        return get().error[entityKey] || null;
      },
      getPagination: (entityType, entityId) => {
        const entityKey = getEntityKey(entityType, entityId);
        return get().pagination[entityKey] || null;
      },
      getUploadProgress: () => get().uploadProgress,
      getSelectedCount: () => get().selectedAttachments.length,
      isSelected: (attachmentId) => get().selectedAttachments.includes(attachmentId),

      // Clear entity data - call on modal close to prevent stale state
      clearEntityData: (entityType, entityId) => set((state) => {
        const entityKey = getEntityKey(entityType, entityId);
        const newAttachments = { ...state.attachments };
        const newLoading = { ...state.loading };
        const newError = { ...state.error };
        const newPagination = { ...state.pagination };
        
        delete newAttachments[entityKey];
        delete newLoading[entityKey];
        delete newError[entityKey];
        delete newPagination[entityKey];

        // Also clear any upload progress for this entity
        const newUploadProgress = { ...state.uploadProgress };
        Object.keys(newUploadProgress).forEach(uploadId => {
          if (newUploadProgress[uploadId]?.entityKey === entityKey) {
            // Revoke object URL if exists
            if (newUploadProgress[uploadId]?.preview) {
              URL.revokeObjectURL(newUploadProgress[uploadId].preview);
            }
            delete newUploadProgress[uploadId];
          }
        });

        return {
          attachments: newAttachments,
          loading: newLoading,
          error: newError,
          pagination: newPagination,
          uploadProgress: newUploadProgress,
          selectedAttachments: []
        };
      }),

      // Legacy clear method - kept for backward compatibility
      clearCardData: (cardId) => {
        get().clearEntityData('card', cardId);
      },

      // Handle real-time events - updated for entity-based handling
      handleAttachmentAdded: (entityType, entityId, attachment) => {
        const entityKey = getEntityKey(entityType, entityId);
        get().addAttachment(entityKey, attachment);
      },

      handleAttachmentDeleted: (entityType, entityId, attachmentId) => {
        const entityKey = getEntityKey(entityType, entityId);
        get().removeAttachment(entityKey, attachmentId);
      },

      handleAttachmentsAdded: (entityType, entityId, attachments) => {
        const entityKey = getEntityKey(entityType, entityId);
        get().addAttachments(entityKey, attachments);
      },

      handleAttachmentsDeleted: (entityType, entityId, attachmentIds) => {
        const entityKey = getEntityKey(entityType, entityId);
        get().removeAttachments(entityKey, attachmentIds);
      }
    })),
    { name: 'attachment-store' }
  )
);

// Export the helper function separately to avoid re-render issues
export { getEntityKey };

export default useAttachmentStore;

