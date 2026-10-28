import api from './api';
import { createSessionFetch } from '../../../shared/sessionTransport.mjs';
export const sessionFetch = createSessionFetch(api, localStorage);
