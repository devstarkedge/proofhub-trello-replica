/**
 * Slack OAuth Handler
 * Handles OAuth 2.0 flow for Slack app installation
 */

import crypto from 'crypto';
import SlackWorkspace from '../../models/SlackWorkspace.js';
import SlackUser from '../../models/SlackUser.js';
import User from '../../models/User.js';

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI || `${process.env.BACKEND_URL}/api/slack/oauth/callback`;

// Required scopes for the bot
const BOT_SCOPES = [
  'app_mentions:read',
  'channels:history',
  'channels:read',
  'chat:write',
  'chat:write.public',
  'commands',
  'files:read',
  'groups:history',
  'groups:read',
  'im:history',
  'im:read',
  'im:write',
  'mpim:history',
  'mpim:read',
  'reactions:read',
  'reactions:write',
  'team:read',
  'users:read',
  'users:read.email',
  'users.profile:read'
].join(',');

// User scopes (for user token, if needed)
const USER_SCOPES = [
  'identity.basic',
  'identity.email',
  'identity.avatar'
].join(',');

class SlackOAuthHandler {
  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(userId, state = null) {
    const stateToken = state || this.generateStateToken(userId);
    
    const params = new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      scope: BOT_SCOPES,
      user_scope: USER_SCOPES,
      redirect_uri: SLACK_REDIRECT_URI,
      state: stateToken
    });

    return {
      url: `https://slack.com/oauth/v2/authorize?${params.toString()}`,
      state: stateToken
    };
  }

  /**
   * Generate state token for CSRF protection
   */
  generateStateToken(userId) {
    const payload = {
      userId,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    };
    
    const signature = crypto
      .createHmac('sha256', SLACK_SIGNING_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    return Buffer.from(JSON.stringify({ ...payload, signature })).toString('base64url');
  }

  /**
   * Verify state token
   */
  verifyStateToken(stateToken) {
    try {
      const decoded = JSON.parse(Buffer.from(stateToken, 'base64url').toString());
      const { userId, timestamp, nonce, signature } = decoded;
      
      // Check timestamp (valid for 10 minutes)
      if (Date.now() - timestamp > 10 * 60 * 1000) {
        return { valid: false, error: 'State token expired' };
      }
      
      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', SLACK_SIGNING_SECRET)
        .update(JSON.stringify({ userId, timestamp, nonce }))
        .digest('hex');
      
      if (signature !== expectedSignature) {
        return { valid: false, error: 'Invalid state signature' };
      }
      
      return { valid: true, userId };
    } catch (error) {
      return { valid: false, error: 'Invalid state token format' };
    }
  }

  /**
   * Exchange code for access token
   */
  async exchangeCodeForToken(code) {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        code,
        redirect_uri: SLACK_REDIRECT_URI
      })
    });

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'OAuth token exchange failed');
    }
    
    return data;
  }

  /**
   * Complete OAuth flow and create/update workspace
   */
  async handleCallback(code, state) {
    // Verify state
    const stateVerification = this.verifyStateToken(state);
    if (!stateVerification.valid) {
      throw new Error(stateVerification.error);
    }
    
    const userId = stateVerification.userId;
    
    // Exchange code for token
    const tokenData = await this.exchangeCodeForToken(code);
    
    // Extract workspace info
    const {
      team,
      authed_user,
      access_token: botAccessToken,
      bot_user_id: botUserId,
      app_id: appId,
      scope,
      enterprise,
      is_enterprise_install: isEnterpriseInstall
    } = tokenData;

    // Check if workspace already exists
    let workspace = await SlackWorkspace.findOne({ teamId: team.id });
    
    if (workspace) {
      // Update existing workspace
      workspace.setBotAccessToken(botAccessToken);
      workspace.botUserId = botUserId;
      workspace.scope = scope;
      workspace.teamName = team.name;
      workspace.isActive = true;
      workspace.healthStatus = 'healthy';
      workspace.consecutiveFailures = 0;
    } else {
      // Create new workspace
      workspace = new SlackWorkspace({
        teamId: team.id,
        teamName: team.name,
        botUserId,
        appId,
        scope,
        installedBy: userId,
        enterpriseId: enterprise?.id,
        enterpriseName: enterprise?.name,
        isEnterpriseInstall: isEnterpriseInstall || false
      });
      workspace.setBotAccessToken(botAccessToken);
    }
    
    await workspace.save();

    // Link the installing user
    if (authed_user?.id) {
      await this.linkSlackUser(workspace, authed_user.id, userId);
    }

    return {
      workspace,
      teamId: team.id,
      teamName: team.name,
      userId
    };
  }

  /**
   * Link a Slack user to a FlowTask user
   */
  async linkSlackUser(workspace, slackUserId, flowTaskUserId) {
    // Get Slack user info
    const userInfo = await this.getSlackUserInfo(workspace, slackUserId);
    
    // Check if already linked
    let slackUser = await SlackUser.findOne({
      slackUserId,
      workspace: workspace._id
    });

    if (slackUser) {
      // Update existing link
      slackUser.user = flowTaskUserId;
      slackUser.slackUsername = userInfo?.name;
      slackUser.slackDisplayName = userInfo?.profile?.display_name || userInfo?.profile?.real_name;
      slackUser.slackEmail = userInfo?.profile?.email;
      slackUser.slackAvatar = userInfo?.profile?.image_72;
      slackUser.slackTimezone = userInfo?.tz;
      slackUser.slackTimezoneOffset = userInfo?.tz_offset;
      slackUser.isActive = true;
      slackUser.unlinkedAt = null;
    } else {
      // Create new link
      slackUser = new SlackUser({
        user: flowTaskUserId,
        workspace: workspace._id,
        slackUserId,
        slackUsername: userInfo?.name,
        slackDisplayName: userInfo?.profile?.display_name || userInfo?.profile?.real_name,
        slackEmail: userInfo?.profile?.email,
        slackAvatar: userInfo?.profile?.image_72,
        slackTimezone: userInfo?.tz || 'UTC',
        slackTimezoneOffset: userInfo?.tz_offset || 0
      });
    }

    await slackUser.save();
    return slackUser;
  }

  /**
   * Unlink a Slack user
   */
  async unlinkSlackUser(slackUserId, workspaceId) {
    const slackUser = await SlackUser.findOne({
      slackUserId,
      workspace: workspaceId
    });

    if (slackUser) {
      slackUser.isActive = false;
      slackUser.unlinkedAt = new Date();
      await slackUser.save();
    }

    return slackUser;
  }

  /**
   * Get Slack user info
   */
  async getSlackUserInfo(workspace, slackUserId) {
    try {
      const token = workspace.botAccessToken;
      
      const response = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (!data.ok) {
        console.error('Failed to get Slack user info:', data.error);
        return null;
      }
      
      return data.user;
    } catch (error) {
      console.error('Error getting Slack user info:', error);
      return null;
    }
  }

  /**
   * Link user by email matching
   */
  async linkUserByEmail(workspace, slackUserId) {
    const slackUserInfo = await this.getSlackUserInfo(workspace, slackUserId);
    
    if (!slackUserInfo?.profile?.email) {
      return null;
    }

    // Find FlowTask user with matching email
    const flowTaskUser = await User.findOne({
      email: slackUserInfo.profile.email.toLowerCase(),
      isActive: true
    });

    if (!flowTaskUser) {
      return null;
    }

    return this.linkSlackUser(workspace, slackUserId, flowTaskUser._id);
  }

  /**
   * Revoke access (uninstall app)
   */
  async revokeAccess(teamId) {
    const workspace = await SlackWorkspace.findOne({ teamId });
    
    if (!workspace) {
      return null;
    }

    // Revoke token
    try {
      await fetch('https://slack.com/api/auth.revoke', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${workspace.botAccessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
    } catch (error) {
      console.error('Error revoking Slack token:', error);
    }

    // Deactivate workspace
    workspace.isActive = false;
    await workspace.save();

    // Deactivate all users in workspace
    await SlackUser.updateMany(
      { workspace: workspace._id },
      { isActive: false, unlinkedAt: new Date() }
    );

    return workspace;
  }

  /**
   * Verify Slack request signature
   */
  verifyRequestSignature(signature, timestamp, body) {
    // Check timestamp (must be within 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) {
      return false;
    }

    // Compute signature
    const sigBasestring = `v0:${timestamp}:${body}`;
    const mySignature = 'v0=' + crypto
      .createHmac('sha256', SLACK_SIGNING_SECRET)
      .update(sigBasestring)
      .digest('hex');

    // Compare signatures
    return crypto.timingSafeEqual(
      Buffer.from(mySignature, 'utf8'),
      Buffer.from(signature, 'utf8')
    );
  }
}

// Export singleton
const slackOAuthHandler = new SlackOAuthHandler();
export default slackOAuthHandler;
export { SlackOAuthHandler };
