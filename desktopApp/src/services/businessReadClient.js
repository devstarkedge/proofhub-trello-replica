import { createBusinessReadClient } from '../../../shared/businessReadClient.mjs';
import { registerResettable } from '../store/resetRegistry';
export const businessReads = createBusinessReadClient({ storage: localStorage, target: window, registerResettable });
