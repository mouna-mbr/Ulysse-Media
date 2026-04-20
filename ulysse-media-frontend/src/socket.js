import { io } from 'socket.io-client';

const BACKEND_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');

export const socket = io(BACKEND_BASE, { autoConnect: false });
