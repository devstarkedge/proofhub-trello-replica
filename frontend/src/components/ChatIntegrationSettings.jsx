import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  MessageSquare, Link2, Unlink, CheckCircle, XCircle,
  Loader2, RefreshCw, Send, Shield, ExternalLink,
} from 'lucide-react';
import chatIntegrationService from '../services/chatIntegrationService';

const ChatIntegrationSettings = ({ userRole }) => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [chatAppUrl, setChatAppUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  const isAdmin = userRole === 'admin' || userRole === 'Admin';

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await chatIntegrationService.getStatus();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch chat integration status:', error);
      if (error.response?.status !== 404) {
        toast.error('Failed to load Chat integration status');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleConnect = async () => {
    if (!chatAppUrl.trim()) {
      toast.error('Enter the ChatApp URL');
      return;
    }

    try {
      setConnecting(true);
      const resp = await chatIntegrationService.connect(chatAppUrl.trim());
      const returnedChatUrl = resp?.data?.chatUrl || chatAppUrl.trim();
      setStatus({ connected: true, chatUrl: returnedChatUrl });
      setChatAppUrl('');
      toast.success('Chat integration connected!');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Chat integration? Webhook events will stop being sent.')) return;

    try {
      await chatIntegrationService.disconnect();
      setStatus({ connected: false });
      toast.success('Chat integration disconnected');
    } catch (error) {
      toast.error('Failed to disconnect');
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      await chatIntegrationService.testConnection();
      toast.success('Test webhook sent successfully!');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Test failed — check ChatApp is running');
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      await chatIntegrationService.triggerSync();
      toast.success('Sync request dispatched to ChatApp');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenChat = async () => {
    try {
      setOpeningChat(true);
      const { data } = await chatIntegrationService.getChatRedirectUrl();
      window.open(data.redirectUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to open ChatApp');
    } finally {
      setOpeningChat(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-500">Loading Chat integration...</span>
      </div>
    );
  }

  const isConnected = status?.connected;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <MessageSquare className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Chat Integration</h3>
            <p className="text-sm text-gray-500">
              Real-time project notifications and team communication
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-green-700 bg-green-100 rounded-full">
              <CheckCircle className="w-4 h-4" /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-gray-600 bg-gray-100 rounded-full">
              <XCircle className="w-4 h-4" /> Not Connected
            </span>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isConnected ? (
          <motion.div
            key="connected"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Connection Info */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-800">
                    Connected to ChatApp
                  </p>
                  {status.chatUrl && (
                    <p className="text-sm text-green-600 mt-1">{status.chatUrl}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Open Chat — Primary Action */}
            <button
              onClick={handleOpenChat}
              disabled={openingChat}
              className="flex items-center justify-center gap-2 w-full px-6 py-3 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {openingChat ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4" />
              )}
              Open Chat
            </button>

            {/* Admin-only: Test, Sync, Disconnect */}
            {isAdmin && (
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Test Connection
                </button>

                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors"
                >
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Sync Now
                </button>

                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <Unlink className="w-4 h-4" />
                  Disconnect
                </button>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="disconnected"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Open Chat — available even without webhook connection */}
            <button
              onClick={handleOpenChat}
              disabled={openingChat}
              className="flex items-center justify-center gap-2 w-full px-6 py-3 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {openingChat ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4" />
              )}
              Open Chat
            </button>

            {isAdmin && (
              <>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-600">
                    <strong>Admin:</strong> Connect FlowTask to ChatApp to automatically sync
                    projects, users, and send real-time notifications about task updates.
                  </p>
                </div>

                <div className="flex gap-3">
                  <input
                    type="url"
                    value={chatAppUrl}
                    onChange={(e) => setChatAppUrl(e.target.value)}
                    placeholder="https://your-chatapp-url.com"
                    className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {connecting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Link2 className="w-4 h-4" />
                    )}
                    Connect Webhooks
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatIntegrationSettings;
