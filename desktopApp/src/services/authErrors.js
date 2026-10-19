export const BACKEND_UNAVAILABLE_MESSAGE =
  'FlowTask could not verify your saved session. The backend may still be starting; retry or sign in.';

export function isAuthenticationRejection(error) {
  return [401, 403].includes(error?.response?.status);
}

export function isTransientBackendError(error) {
  if (error?.code === 'INVALID_SESSION_PAYLOAD') return false;
  const status = error?.response?.status;
  return !status || status === 408 || status === 425 || status === 429 || status >= 500;
}

export function isBackendConnectivityError(error) {
  const status = error?.response?.status;
  return !status || [408, 502, 503, 504].includes(status);
}

export function getLoginErrorMessage(error) {
  if (isTransientBackendError(error)) return BACKEND_UNAVAILABLE_MESSAGE;

  const serverMessage = error?.response?.data?.message;
  if (typeof serverMessage === 'string') {
    const normalized = serverMessage.toLowerCase();
    if (normalized.includes('invalid credentials') || normalized.includes('no account found') || normalized.includes('password')) {
      return 'Invalid email or password. Please try again.';
    }
    if (normalized.includes('deactivated')) {
      return 'Your account has been deactivated. Please contact support.';
    }
    return serverMessage;
  }

  if (error?.response?.status === 400) return 'Please provide valid email and password.';
  if (error?.response?.status === 401) return 'Invalid email or password. Please try again.';
  return 'Login could not be completed. Please try again.';
}

export function getSafeAuthDiagnostic(error) {
  return {
    status: error?.response?.status ?? null,
    code: error?.code ?? null,
    message: typeof error?.message === 'string' ? error.message : 'Unknown authentication error',
  };
}
