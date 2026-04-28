import mongoose from 'mongoose';

export const FINANCE_PAGE_KEY = 'finance';

export const FULL_FINANCE_PERMISSIONS = Object.freeze({
  pageKey: FINANCE_PAGE_KEY,
  hasAccess: true,
  revenueAnalytics: true,
  billingDetails: true
});

export const EMPTY_FINANCE_PERMISSIONS = Object.freeze({
  pageKey: FINANCE_PAGE_KEY,
  hasAccess: false,
  revenueAnalytics: false,
  billingDetails: false
});

const userPermissionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  pageKey: {
    type: String,
    required: [true, 'Page key is required'],
    lowercase: true,
    trim: true,
    default: FINANCE_PAGE_KEY
  },
  hasAccess: {
    type: Boolean,
    default: false
  },
  revenueAnalytics: {
    type: Boolean,
    default: false
  },
  billingDetails: {
    type: Boolean,
    default: false
  },
  grantedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  collection: 'user_permissions',
  timestamps: true
});

userPermissionSchema.index({ user: 1, pageKey: 1 }, { unique: true });
userPermissionSchema.index({ pageKey: 1, hasAccess: 1 });

export const normalizePermissionRole = (role) => {
  const normalized = String(role || '').toLowerCase().trim();
  return normalized === 'member' ? 'employee' : normalized;
};

export const getDefaultPagePermissions = (role, pageKey = FINANCE_PAGE_KEY) => {
  const normalizedRole = normalizePermissionRole(role);

  if (pageKey === FINANCE_PAGE_KEY && normalizedRole === 'admin') {
    return { ...FULL_FINANCE_PERMISSIONS };
  }

  return { ...EMPTY_FINANCE_PERMISSIONS, pageKey };
};

export const serializePagePermission = (permission, role, pageKey = FINANCE_PAGE_KEY) => {
  const normalizedRole = normalizePermissionRole(role);

  if (normalizedRole === 'admin') {
    return {
      ...FULL_FINANCE_PERMISSIONS,
      locked: true
    };
  }

  if (!permission) {
    return {
      ...getDefaultPagePermissions(normalizedRole, pageKey),
      locked: false
    };
  }

  return {
    pageKey: permission.pageKey || pageKey,
    hasAccess: permission.hasAccess === true,
    revenueAnalytics: permission.revenueAnalytics === true,
    billingDetails: permission.billingDetails === true,
    locked: false,
    updatedAt: permission.updatedAt
  };
};

userPermissionSchema.statics.getPagePermissions = async function(userId, role, pageKey = FINANCE_PAGE_KEY) {
  const normalizedRole = normalizePermissionRole(role);

  if (normalizedRole === 'admin') {
    return serializePagePermission(null, normalizedRole, pageKey);
  }

  const permission = await this.findOne({ user: userId, pageKey }).lean();
  return serializePagePermission(permission, normalizedRole, pageKey);
};

export default mongoose.model('UserPermission', userPermissionSchema);
