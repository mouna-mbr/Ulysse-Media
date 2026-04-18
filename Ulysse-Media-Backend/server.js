require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const mysql = require('mysql2/promise');
const { parse } = require('csv-parse/sync');
const { Server: SocketIOServer } = require('socket.io');
const Stripe = require('stripe');
const { google } = require('googleapis');

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
const upload = multer({ storage: multer.memoryStorage() });

// Map userId -> Set of socket ids for targeted delivery
const connectedUsers = new Map();

io.on('connection', (socket) => {
  socket.on('authenticate', ({ token }) => {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'ulysse-media-secret-dev');
      socket.userId = payload.id;
      if (!connectedUsers.has(payload.id)) connectedUsers.set(payload.id, new Set());
      connectedUsers.get(payload.id).add(socket.id);
    } catch (_) {}
  });
  socket.on('disconnect', () => {
    if (socket.userId) {
      const sockets = connectedUsers.get(socket.userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (!sockets.size) connectedUsers.delete(socket.userId);
      }
    }
  });
});

function emitToUser(userId, event, data) {
  const sockets = connectedUsers.get(userId);
  if (sockets) sockets.forEach((sid) => io.to(sid).emit(event, data));
}

async function createNotification(userId, { title, message, link, type }) {
  const notif = {
    id: createId('notif'),
    user_id: userId,
    type: type || 'info',
    title,
    message: message || '',
    link: link || '',
    read: 0,
    created_at: mysqlNow()
  };
  try {
    await query(
      'INSERT INTO notifications (id, user_id, type, title, message, link, `read`, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [notif.id, notif.user_id, notif.type, notif.title, notif.message, notif.link, notif.read, notif.created_at]
    );
    emitToUser(userId, 'notification', {
      id: notif.id, type: notif.type, title: notif.title,
      message: notif.message, link: notif.link, read: false, createdAt: notif.created_at
    });
  } catch (_) {}
}

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const safeFileName = (name) => String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
const fileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniquePrefix = `${Date.now()}-${crypto.randomUUID()}`;
    cb(null, `${uniquePrefix}-${safeFileName(file.originalname)}`);
  }
});
const uploadFile = multer({ storage: fileStorage });

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'ulysse-media-secret-dev';
const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'root';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'UlysseMediaDB';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

let db;

app.use(cors());
// Stripe webhook needs raw body — register before express.json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(uploadsDir));

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function query(sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows;
}

async function ensureColumnIfMissing(tableName, columnName, definitionSql) {
  const rows = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [MYSQL_DATABASE, tableName, columnName]
  );

  if (!rows.length) {
    await query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
  }
}

function sanitizeUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

function mapUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    suspended: !!row.suspended,
    specialite: row.specialite,
    disponibilite: row.disponibilite === null ? null : !!row.disponibilite,
    tauxHoraire: row.taux_horaire,
    niveau: row.niveau,
    tel: row.tel,
    address: row.address,
    createdAt: row.created_at,
    createdBy: row.created_by
  };
}

function parseJsonArray(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function parseJsonObject(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function normalizeIncludedInput(rawIncluded) {
  if (Array.isArray(rawIncluded)) {
    return rawIncluded.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof rawIncluded === 'string') {
    try {
      const parsed = JSON.parse(rawIncluded);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch (_error) {
      return rawIncluded.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function normalizeAssetType(type, url = '') {
  if (type) return String(type).trim().toLowerCase();
  if (url.endsWith('.pdf')) return 'pdf';
  return 'link';
}

function normalizePortfolioAssets(rawAssets) {
  if (!rawAssets) return [];

  let parsedAssets = rawAssets;
  if (typeof rawAssets === 'string') {
    try {
      parsedAssets = JSON.parse(rawAssets);
    } catch (_error) {
      parsedAssets = [];
    }
  }

  if (!Array.isArray(parsedAssets)) return [];

  return parsedAssets
    .map((asset) => ({
      id: asset.id || createId('ast'),
      label: asset.label ? String(asset.label).trim() : 'Ressource',
      type: normalizeAssetType(asset.type, String(asset.url || '')),
      url: asset.url ? String(asset.url).trim() : ''
    }))
    .filter((asset) => asset.url);
}

function buildUploadedAsset(req, file) {
  const assetType = file.mimetype.startsWith('image/')
    ? 'image'
    : file.mimetype === 'application/pdf'
      ? 'pdf'
      : 'file';

  return {
    id: createId('ast'),
    label: file.originalname,
    type: assetType,
    url: toPublicUploadUrl(req, file.filename)
  };
}

function mapPortfolioRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    assets: normalizePortfolioAssets(row.assets_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapServiceRow(row, portfolio = null) {
  return {
    id: row.id,
    name: row.name,
    category: row.category || 'General',
    description: row.description,
    coverImage: row.cover_image,
    startingPrice: Number(row.starting_price || 0),
    priceNote: row.price_note || '',
    timelineRange: row.timeline_range || '',
    included: parseJsonArray(row.included_json),
    portfolioId: row.portfolio_id || null,
    portfolio,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapQuoteRequestRow(row) {
  const files = parseJsonArray(row.files_json);
  const paletteColors = parseJsonArray(row.palette_colors_json);
  const normalizedFiles = files.length
    ? files
    : (row.file_url ? [{ id: `file_${row.id}`, url: row.file_url, name: row.file_name || 'Fichier' }] : []);

  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_username || null,
    serviceId: row.service_id,
    serviceName: row.service_name || null,
    description: row.description,
    paletteCouleur: row.palette_couleur,
    paletteColors,
    inspiration: row.inspiration,
    inspirationLink: row.inspiration_link,
    contraintes: row.contraintes,
    serviceType: row.service_type,
    budget: row.budget,
    deadline: row.deadline,
    fileUrl: row.file_url,
    fileName: row.file_name,
    files: normalizedFiles,
    statut: row.statut,
    assignedEmployeeId: row.assigned_employee_id || null,
    assignedEmployeeName: row.employee_username || null,
    assignedAt: row.assigned_at || null,
    assignmentAuto: row.assignment_auto === null ? null : !!row.assignment_auto,
    study: parseJsonObject(row.study_json),
    studySubmittedAt: row.study_submitted_at || null,
    finalEstimation: parseJsonObject(row.final_estimation_json),
    finalEstimationAt: row.final_estimation_at || null,
    clientNotified: row.client_notified === null ? false : !!row.client_notified,
    clientSeen: row.client_seen === null ? false : !!row.client_seen,
    clientSeenAt: row.client_seen_at || null,
    clientResponse: row.client_response || null,
    depositPaid: !!row.deposit_paid,
    dateCreation: row.date_creation
  };
}

function mapMeetingRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    start: row.start_date,
    end: row.end_date,
    timezone: row.timezone || 'Europe/Paris',
    status: row.status,
    syncStatus: row.sync_status,
    meetLink: row.meet_link || null,
    googleEventId: row.google_event_id || null,
    createdBy: row.created_by,
    clientUserId: row.client_user_id || null,
    clientEmail: row.client_email || null,
    clientName: row.client_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function isGoogleCalendarConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI && GOOGLE_REFRESH_TOKEN);
}

function getGoogleOAuthClient() {
  if (!isGoogleCalendarConfigured()) return null;
  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return client;
}

function getGoogleCalendarClient() {
  const authClient = getGoogleOAuthClient();
  if (!authClient) return null;
  return google.calendar({ version: 'v3', auth: authClient });
}

function parseDateInput(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

function toPublicUploadUrl(req, filename) {
  if (!filename) return '';
  return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
}

// Returns current datetime in MySQL-compatible format 'YYYY-MM-DD HH:MM:SS'
function mysqlNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token manquant.' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide.' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }
    return next();
  };
}

async function findUserByEmail(email) {
  const rows = await query('SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1', [email]);
  return rows[0] ? mapUserRow(rows[0]) : null;
}

async function findUserById(id) {
  const rows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] ? mapUserRow(rows[0]) : null;
}

async function createGoogleMeetingEvent({ title, description, startIso, endIso, timezone, attendeeEmails, requestId }) {
  const calendar = getGoogleCalendarClient();
  if (!calendar) throw new Error('Google Calendar n\'est pas configure sur le serveur.');

  const response = await calendar.events.insert({
    calendarId: GOOGLE_CALENDAR_ID,
    conferenceDataVersion: 1,
    sendUpdates: 'all',
    requestBody: {
      summary: title,
      description: description || '',
      start: { dateTime: startIso, timeZone: timezone },
      end: { dateTime: endIso, timeZone: timezone },
      attendees: attendeeEmails.map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 }
        ]
      }
    }
  });

  const event = response.data;
  const meetLink = event.hangoutLink
    || (event.conferenceData?.entryPoints || []).find((entry) => entry.entryPointType === 'video')?.uri
    || null;

  return { googleEventId: event.id, meetLink };
}

async function updateGoogleMeetingEvent({ googleEventId, title, description, startIso, endIso, timezone, attendeeEmails }) {
  const calendar = getGoogleCalendarClient();
  if (!calendar) throw new Error('Google Calendar n\'est pas configure sur le serveur.');

  const response = await calendar.events.patch({
    calendarId: GOOGLE_CALENDAR_ID,
    eventId: googleEventId,
    sendUpdates: 'all',
    requestBody: {
      summary: title,
      description: description || '',
      start: { dateTime: startIso, timeZone: timezone },
      end: { dateTime: endIso, timeZone: timezone },
      attendees: attendeeEmails.map((email) => ({ email }))
    }
  });

  const event = response.data;
  const meetLink = event.hangoutLink
    || (event.conferenceData?.entryPoints || []).find((entry) => entry.entryPointType === 'video')?.uri
    || null;

  return { meetLink };
}

async function cancelGoogleMeetingEvent(googleEventId) {
  const calendar = getGoogleCalendarClient();
  if (!calendar) throw new Error('Google Calendar n\'est pas configure sur le serveur.');

  await calendar.events.delete({
    calendarId: GOOGLE_CALENDAR_ID,
    eventId: googleEventId,
    sendUpdates: 'all'
  });
}

function makeToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      email: user.email,
      username: user.username
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/register-client', async (req, res) => {
  const { username, email, password, tel, address } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'username, email et password sont requis.' });
  }
  const existing = await findUserByEmail(email);
  if (existing) {
    return res.status(409).json({ message: 'Email déjà utilisé.' });
  }

  const now = mysqlNow();
  const user = {
    id: createId('usr'),
    username,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: 'CLIENT',
    suspended: false,
    tel: tel || '',
    address: address || '',
    createdAt: now,
    createdBy: 'SELF'
  };

  await query(
    `INSERT INTO users (
      id, username, email, password_hash, role, suspended, tel, address, created_at, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id,
      user.username,
      user.email,
      user.passwordHash,
      user.role,
      user.suspended ? 1 : 0,
      user.tel,
      user.address,
      user.createdAt,
      user.createdBy
    ]
  );

  const token = makeToken(user);
  return res.status(201).json({ token, user: sanitizeUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email et mot de passe requis.' });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ message: 'Identifiants invalides.' });
  }
  if (user.suspended) {
    return res.status(403).json({ message: 'Compte suspendu. Contactez un administrateur.' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: 'Identifiants invalides.' });
  }

  const token = makeToken(user);
  return res.json({ token, user: sanitizeUser(user) });
});

app.get('/api/auth/me', auth, (req, res) => {
  findUserById(req.user.id)
    .then((user) => {
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur introuvable.' });
      }
      return res.json({ user: sanitizeUser(user) });
    })
    .catch((error) => res.status(500).json({ message: error.message || 'Erreur serveur.' }));
});

async function getPortfolioByServiceId(serviceId) {
  const rows = await query(
    `SELECT p.*
     FROM portfolios p
     INNER JOIN services s ON s.portfolio_id = p.id
     WHERE s.id = ?
     LIMIT 1`,
    [serviceId]
  );
  return rows[0] ? mapPortfolioRow(rows[0]) : null;
}

async function findPortfolioById(portfolioId) {
  const rows = await query('SELECT * FROM portfolios WHERE id = ? LIMIT 1', [portfolioId]);
  return rows[0] ? mapPortfolioRow(rows[0]) : null;
}

async function findServiceById(serviceId) {
  const rows = await query('SELECT * FROM services WHERE id = ? LIMIT 1', [serviceId]);
  if (!rows.length) return null;
  const portfolio = await getPortfolioByServiceId(serviceId);
  return mapServiceRow(rows[0], portfolio);
}

async function findQuoteRequestById(quoteId) {
  const rows = await query(
    `SELECT q.*, c.username AS client_username, e.username AS employee_username, s.name AS service_name
     FROM quote_requests q
     LEFT JOIN users c ON c.id = q.client_id
     LEFT JOIN users e ON e.id = q.assigned_employee_id
     LEFT JOIN services s ON s.id = q.service_id
     WHERE q.id = ?
     LIMIT 1`,
    [quoteId]
  );
  return rows[0] ? mapQuoteRequestRow(rows[0]) : null;
}

function canAccessQuoteRequest(user, quoteRequest) {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'CLIENT') return quoteRequest.clientId === user.id;
  if (user.role === 'EMPLOYE') return quoteRequest.assignedEmployeeId === user.id;
  return false;
}

async function pickSuggestedEmployeeForQuote(quoteRequest) {
  const employees = await query(
    `SELECT * FROM users
     WHERE role = 'EMPLOYE' AND suspended = 0
     ORDER BY CASE WHEN disponibilite = 1 THEN 0 ELSE 1 END, created_at ASC`
  );

  if (!employees.length) return null;

  const requestedType = String(quoteRequest.serviceType || '').toLowerCase();
  const availableEmployees = employees.filter((row) => row.disponibilite === null || !!row.disponibilite);
  const preferredPool = availableEmployees.length ? availableEmployees : employees;

  const matched = preferredPool.find((row) => {
    const specialite = String(row.specialite || '').toLowerCase();
    return requestedType && specialite && specialite.includes(requestedType);
  });

  const selected = matched || preferredPool[0];
  return selected ? mapUserRow(selected) : null;
}

app.get('/api/services', async (_req, res) => {
  const rows = await query('SELECT * FROM services ORDER BY created_at DESC');
  const services = [];

  for (const row of rows) {
    const portfolio = await getPortfolioByServiceId(row.id);
    services.push(mapServiceRow(row, portfolio));
  }

  return res.json({ services });
});

app.get('/api/services/:id', async (req, res) => {
  const service = await findServiceById(req.params.id);
  if (!service) {
    return res.status(404).json({ message: 'Service introuvable.' });
  }
  return res.json({ service });
});

app.post('/api/services', auth, authorize('ADMIN'), uploadFile.single('coverImageFile'), async (req, res) => {
  const {
    name,
    category,
    description,
    coverImage,
    startingPrice,
    priceNote,
    timelineRange,
    included,
    portfolioId
  } = req.body;

  if (!name || !description) {
    return res.status(400).json({ message: 'name et description sont requis.' });
  }

  if (portfolioId) {
    const existingPortfolio = await findPortfolioById(portfolioId);
    if (!existingPortfolio) {
      return res.status(404).json({ message: 'Portfolio introuvable.' });
    }
  }

  const service = {
    id: createId('svc'),
    name: String(name).trim(),
    category: category ? String(category).trim() : 'General',
    description: String(description).trim(),
    coverImage: req.file
      ? toPublicUploadUrl(req, req.file.filename)
      : (coverImage ? String(coverImage).trim() : ''),
    startingPrice: Number(startingPrice || 0),
    priceNote: priceNote ? String(priceNote).trim() : '',
    timelineRange: timelineRange ? String(timelineRange).trim() : '',
    included: normalizeIncludedInput(included),
    portfolioId: portfolioId ? String(portfolioId).trim() : null,
    createdAt: mysqlNow(),
    updatedAt: mysqlNow()
  };

  await query(
    `INSERT INTO services (
      id, name, category, description, cover_image, starting_price,
      price_note, timeline_range, included_json, portfolio_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      service.id,
      service.name,
      service.category,
      service.description,
      service.coverImage,
      service.startingPrice,
      service.priceNote,
      service.timelineRange,
      JSON.stringify(service.included),
      service.portfolioId,
      service.createdAt,
      service.updatedAt
    ]
  );

  return res.status(201).json({ service });
});

app.patch('/api/services/:id', auth, authorize('ADMIN'), uploadFile.single('coverImageFile'), async (req, res) => {
  const existingService = await findServiceById(req.params.id);
  if (!existingService) {
    return res.status(404).json({ message: 'Service introuvable.' });
  }

  if (typeof req.body.portfolioId !== 'undefined' && req.body.portfolioId) {
    const existingPortfolio = await findPortfolioById(req.body.portfolioId);
    if (!existingPortfolio) {
      return res.status(404).json({ message: 'Portfolio introuvable.' });
    }
  }

  const nextService = {
    ...existingService,
    name: typeof req.body.name === 'string' && req.body.name.trim() ? req.body.name.trim() : existingService.name,
    category: typeof req.body.category === 'string' ? req.body.category.trim() : existingService.category,
    description: typeof req.body.description === 'string' && req.body.description.trim()
      ? req.body.description.trim()
      : existingService.description,
    coverImage: req.file
      ? toPublicUploadUrl(req, req.file.filename)
      : (typeof req.body.coverImage === 'string' ? req.body.coverImage.trim() : existingService.coverImage),
    startingPrice: typeof req.body.startingPrice !== 'undefined'
      ? Number(req.body.startingPrice || 0)
      : existingService.startingPrice,
    priceNote: typeof req.body.priceNote === 'string' ? req.body.priceNote.trim() : existingService.priceNote,
    timelineRange: typeof req.body.timelineRange === 'string' ? req.body.timelineRange.trim() : existingService.timelineRange,
    included: typeof req.body.included !== 'undefined'
      ? normalizeIncludedInput(req.body.included)
      : existingService.included,
    portfolioId: typeof req.body.portfolioId !== 'undefined'
      ? (req.body.portfolioId ? String(req.body.portfolioId).trim() : null)
      : existingService.portfolioId,
    updatedAt: mysqlNow()
  };

  await query(
    `UPDATE services SET
      name = ?, category = ?, description = ?, cover_image = ?, starting_price = ?,
      price_note = ?, timeline_range = ?, included_json = ?, portfolio_id = ?, updated_at = ?
     WHERE id = ?`,
    [
      nextService.name,
      nextService.category,
      nextService.description,
      nextService.coverImage,
      nextService.startingPrice,
      nextService.priceNote,
      nextService.timelineRange,
      JSON.stringify(nextService.included),
      nextService.portfolioId,
      nextService.updatedAt,
      existingService.id
    ]
  );

  return res.json({ service: nextService });
});

app.get('/api/portfolios', auth, authorize('ADMIN'), async (_req, res) => {
  const rows = await query('SELECT * FROM portfolios ORDER BY created_at DESC');
  return res.json({ portfolios: rows.map(mapPortfolioRow) });
});

app.get('/api/portfolios/:id', auth, authorize('ADMIN'), async (req, res) => {
  const portfolio = await findPortfolioById(req.params.id);
  if (!portfolio) {
    return res.status(404).json({ message: 'Portfolio introuvable.' });
  }
  return res.json({ portfolio });
});

app.post('/api/portfolios', auth, authorize('ADMIN'), uploadFile.array('assetFiles', 20), async (req, res) => {
  const { title, description, assets } = req.body;
  if (!title) {
    return res.status(400).json({ message: 'title requis.' });
  }

  const portfolio = {
    id: createId('pfl'),
    title: String(title).trim(),
    description: description ? String(description).trim() : '',
    assets: [
      ...normalizePortfolioAssets(assets),
      ...(req.files || []).map((file) => buildUploadedAsset(req, file))
    ],
    createdAt: mysqlNow(),
    updatedAt: mysqlNow()
  };

  await query(
    `INSERT INTO portfolios (id, title, description, assets_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [portfolio.id, portfolio.title, portfolio.description, JSON.stringify(portfolio.assets), portfolio.createdAt, portfolio.updatedAt]
  );

  return res.status(201).json({ portfolio });
});

app.patch('/api/portfolios/:id', auth, authorize('ADMIN'), uploadFile.array('assetFiles', 20), async (req, res) => {
  const existingPortfolio = await findPortfolioById(req.params.id);
  if (!existingPortfolio) {
    return res.status(404).json({ message: 'Portfolio introuvable.' });
  }

  const nextPortfolio = {
    ...existingPortfolio,
    title: typeof req.body.title === 'string' && req.body.title.trim() ? req.body.title.trim() : existingPortfolio.title,
    description: typeof req.body.description === 'string' ? req.body.description.trim() : existingPortfolio.description,
    assets: typeof req.body.assets !== 'undefined'
      ? [
          ...normalizePortfolioAssets(req.body.assets),
          ...(req.files || []).map((file) => buildUploadedAsset(req, file))
        ]
      : [...existingPortfolio.assets, ...(req.files || []).map((file) => buildUploadedAsset(req, file))],
    updatedAt: mysqlNow()
  };

  await query(
    `UPDATE portfolios SET title = ?, description = ?, assets_json = ?, updated_at = ? WHERE id = ?`,
    [nextPortfolio.title, nextPortfolio.description, JSON.stringify(nextPortfolio.assets), nextPortfolio.updatedAt, nextPortfolio.id]
  );

  return res.json({ portfolio: nextPortfolio });
});

app.delete('/api/portfolios/:id', auth, authorize('ADMIN'), async (req, res) => {
  const existingPortfolio = await findPortfolioById(req.params.id);
  if (!existingPortfolio) {
    return res.status(404).json({ message: 'Portfolio introuvable.' });
  }

  await query('UPDATE services SET portfolio_id = NULL WHERE portfolio_id = ?', [existingPortfolio.id]);
  await query('DELETE FROM portfolios WHERE id = ?', [existingPortfolio.id]);

  return res.json({ message: 'Portfolio supprimé.' });
});

app.delete('/api/services/:id', auth, authorize('ADMIN'), async (req, res) => {
  const existingService = await findServiceById(req.params.id);
  if (!existingService) {
    return res.status(404).json({ message: 'Service introuvable.' });
  }

  await query('DELETE FROM service_portfolio WHERE service_id = ?', [existingService.id]);
  await query('DELETE FROM services WHERE id = ?', [existingService.id]);

  return res.json({ message: 'Service supprimé.' });
});

app.get('/api/services/:serviceId/portfolio', async (req, res) => {
  const service = await findServiceById(req.params.serviceId);
  if (!service) {
    return res.status(404).json({ message: 'Service introuvable.' });
  }
  return res.json({ portfolio: service.portfolio });
});

app.post('/api/services/:serviceId/portfolio', auth, authorize('ADMIN'), uploadFile.single('imageFile'), async (req, res) => {
  const service = await findServiceById(req.params.serviceId);
  if (!service) {
    return res.status(404).json({ message: 'Service introuvable.' });
  }

  const { title, description, imageUrl } = req.body;
  const finalImageUrl = req.file
    ? toPublicUploadUrl(req, req.file.filename)
    : (imageUrl ? String(imageUrl).trim() : '');
  if (!title || !finalImageUrl) {
    return res.status(400).json({ message: 'title et image (fichier ou URL) sont requis.' });
  }

  const portfolioItem = {
    id: createId('prt'),
    serviceId: service.id,
    title: String(title).trim(),
    description: description ? String(description).trim() : '',
    imageUrl: finalImageUrl,
    createdAt: mysqlNow()
  };

  await query(
    `INSERT INTO service_portfolio (
      id, service_id, title, description, image_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      portfolioItem.id,
      portfolioItem.serviceId,
      portfolioItem.title,
      portfolioItem.description,
      portfolioItem.imageUrl,
      portfolioItem.createdAt
    ]
  );

  return res.status(201).json({ portfolioItem });
});

app.patch('/api/services/:serviceId/portfolio/:portfolioId', auth, authorize('ADMIN'), uploadFile.single('imageFile'), async (req, res) => {
  const { serviceId, portfolioId } = req.params;
  const rows = await query('SELECT * FROM service_portfolio WHERE id = ? AND service_id = ? LIMIT 1', [portfolioId, serviceId]);
  if (!rows.length) {
    return res.status(404).json({ message: 'Projet portfolio introuvable.' });
  }

  const existing = mapPortfolioRow(rows[0]);
  const nextPortfolio = {
    ...existing,
    title: typeof req.body.title === 'string' && req.body.title.trim() ? req.body.title.trim() : existing.title,
    description: typeof req.body.description === 'string' ? req.body.description.trim() : existing.description,
    imageUrl: req.file
      ? toPublicUploadUrl(req, req.file.filename)
      : (typeof req.body.imageUrl === 'string' && req.body.imageUrl.trim() ? req.body.imageUrl.trim() : existing.imageUrl)
  };

  await query(
    `UPDATE service_portfolio
     SET title = ?, description = ?, image_url = ?
     WHERE id = ? AND service_id = ?`,
    [nextPortfolio.title, nextPortfolio.description, nextPortfolio.imageUrl, portfolioId, serviceId]
  );

  return res.json({ portfolioItem: nextPortfolio });
});

app.delete('/api/services/:serviceId/portfolio/:portfolioId', auth, authorize('ADMIN'), async (req, res) => {
  const { serviceId, portfolioId } = req.params;
  const deleteResult = await query('DELETE FROM service_portfolio WHERE id = ? AND service_id = ?', [portfolioId, serviceId]);
  if (deleteResult.affectedRows === 0) {
    return res.status(404).json({ message: 'Projet portfolio introuvable.' });
  }
  return res.json({ message: 'Projet portfolio supprimé.' });
});

app.get('/api/users', auth, authorize('ADMIN'), async (req, res) => {
  const { role } = req.query;
  let sql = 'SELECT * FROM users';
  const params = [];
  if (role) {
    sql += ' WHERE role = ?';
    params.push(String(role).toUpperCase());
  }
  sql += ' ORDER BY created_at DESC';
  const rows = await query(sql, params);
  const users = rows.map(mapUserRow);
  return res.json({ users: users.map(sanitizeUser) });
});

app.post('/api/users', auth, authorize('ADMIN'), async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { username, email, password, role, specialite, tauxHoraire, disponibilite, niveau, tel, address } = body;
  const normalizedRole = String(role || '').toUpperCase();

  if (!username || !email || !password || !normalizedRole) {
    return res.status(400).json({ message: 'username, email, password, role sont requis.' });
  }
  if (!['ADMIN', 'EMPLOYE', 'CLIENT'].includes(normalizedRole)) {
    return res.status(400).json({ message: 'Rôle invalide.' });
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    return res.status(409).json({ message: 'Email déjà utilisé.' });
  }

  const now = mysqlNow();
  const user = {
    id: createId('usr'),
    username,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: normalizedRole,
    suspended: false,
    createdAt: now,
    createdBy: req.user.id
  };

  if (normalizedRole === 'EMPLOYE') {
    user.specialite = specialite || '';
    user.tauxHoraire = Number(tauxHoraire || 0);
    user.disponibilite = typeof disponibilite === 'boolean' ? disponibilite : true;
  }
  if (normalizedRole === 'ADMIN') {
    user.niveau = niveau || 'STANDARD';
  }
  if (normalizedRole === 'CLIENT') {
    user.tel = tel || '';
    user.address = address || '';
  }

  await query(
    `INSERT INTO users (
      id, username, email, password_hash, role, suspended, specialite, disponibilite,
      taux_horaire, niveau, tel, address, created_at, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id,
      user.username,
      user.email,
      user.passwordHash,
      user.role,
      user.suspended ? 1 : 0,
      user.specialite || null,
      typeof user.disponibilite === 'boolean' ? (user.disponibilite ? 1 : 0) : null,
      typeof user.tauxHoraire === 'number' ? user.tauxHoraire : null,
      user.niveau || null,
      user.tel || null,
      user.address || null,
      user.createdAt,
      user.createdBy
    ]
  );
  return res.status(201).json({ user: sanitizeUser(user) });
});

app.post('/api/users/bulk-csv', auth, authorize('ADMIN'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Fichier CSV requis (champ: file).' });
  }

  const content = req.file.buffer.toString('utf-8');
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const inserted = [];
  const rejected = [];

  for (const row of rows) {
    const username = row.username || row.nom;
    const email = row.email;
    const password = row.password || 'Temp1234!';
    const role = String(row.role || 'EMPLOYE').toUpperCase();

    if (!username || !email || !['ADMIN', 'EMPLOYE', 'CLIENT'].includes(role)) {
      rejected.push({ row, reason: 'Données invalides' });
      continue;
    }
    const existing = await findUserByEmail(email);
    if (existing) {
      rejected.push({ row, reason: 'Email déjà existant' });
      continue;
    }

    const user = {
      id: createId('usr'),
      username,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role,
      suspended: false,
      createdAt: mysqlNow(),
      createdBy: req.user.id,
      specialite: row.specialite || '',
      tauxHoraire: Number(row.tauxHoraire || 0),
      disponibilite: String(row.disponibilite || 'true').toLowerCase() !== 'false',
      niveau: row.niveau || 'STANDARD',
      tel: row.tel || '',
      address: row.address || ''
    };

    await query(
      `INSERT INTO users (
        id, username, email, password_hash, role, suspended, specialite, disponibilite,
        taux_horaire, niveau, tel, address, created_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.username,
        user.email,
        user.passwordHash,
        user.role,
        0,
        user.specialite || null,
        user.disponibilite ? 1 : 0,
        user.tauxHoraire,
        user.niveau || null,
        user.tel || null,
        user.address || null,
        user.createdAt,
        user.createdBy
      ]
    );
    inserted.push(sanitizeUser(user));
  }

  return res.status(201).json({ insertedCount: inserted.length, rejectedCount: rejected.length, inserted, rejected });
});

app.patch('/api/users/:id/suspend', auth, authorize('ADMIN'), async (req, res) => {
  const { suspended } = req.body;
  if (typeof suspended !== 'boolean') {
    return res.status(400).json({ message: 'suspended doit être un booléen.' });
  }

  const user = await findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ message: 'Utilisateur introuvable.' });
  }
  if (user.id === req.user.id) {
    return res.status(400).json({ message: 'Impossible de se suspendre soi-même.' });
  }

  await query('UPDATE users SET suspended = ? WHERE id = ?', [suspended ? 1 : 0, req.params.id]);
  user.suspended = suspended;
  return res.json({ user: sanitizeUser(user) });
});

app.patch('/api/users/:id', auth, authorize('ADMIN'), async (req, res) => {
  const user = await findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ message: 'Utilisateur introuvable.' });
  }

  const { username, email, specialite, tauxHoraire, disponibilite, niveau, tel, address } = req.body;

  const nextUser = { ...user };
  if (typeof username === 'string' && username.trim()) {
    nextUser.username = username.trim();
  }
  if (typeof email === 'string' && email.trim()) {
    nextUser.email = email.trim();
  }
  if (nextUser.role === 'EMPLOYE') {
    if (typeof specialite === 'string') nextUser.specialite = specialite;
    if (typeof tauxHoraire !== 'undefined') nextUser.tauxHoraire = Number(tauxHoraire || 0);
    if (typeof disponibilite === 'boolean') nextUser.disponibilite = disponibilite;
  }
  if (nextUser.role === 'ADMIN' && typeof niveau === 'string') {
    nextUser.niveau = niveau;
  }
  if (nextUser.role === 'CLIENT') {
    if (typeof tel === 'string') nextUser.tel = tel;
    if (typeof address === 'string') nextUser.address = address;
  }

  await query(
    `UPDATE users SET
      username = ?, email = ?, specialite = ?, disponibilite = ?, taux_horaire = ?,
      niveau = ?, tel = ?, address = ?
     WHERE id = ?`,
    [
      nextUser.username,
      nextUser.email,
      nextUser.specialite || null,
      typeof nextUser.disponibilite === 'boolean' ? (nextUser.disponibilite ? 1 : 0) : null,
      typeof nextUser.tauxHoraire === 'number' ? nextUser.tauxHoraire : null,
      nextUser.niveau || null,
      nextUser.tel || null,
      nextUser.address || null,
      nextUser.id
    ]
  );

  return res.json({ user: sanitizeUser(nextUser) });
});

app.post('/api/quote-requests', auth, authorize('CLIENT'), uploadFile.fields([{ name: 'files', maxCount: 10 }, { name: 'file', maxCount: 1 }]), async (req, res) => {
  const {
    serviceId,
    description,
    paletteCouleur,
    paletteColors,
    inspiration,
    inspirationLink,
    contraintes,
    serviceType,
    budget,
    deadline
  } = req.body;

  if (!description || String(description).trim().length < 50) {
    return res.status(400).json({ message: 'Description requise (minimum 50 caractères).' });
  }

  if (!serviceId) {
    return res.status(400).json({ message: 'serviceId requis.' });
  }

  const service = await findServiceById(serviceId);
  if (!service) {
    return res.status(404).json({ message: 'Service introuvable.' });
  }

  const uploadedMultiFiles = Array.isArray(req.files?.files) ? req.files.files : [];
  const uploadedSingleFile = Array.isArray(req.files?.file) ? req.files.file : [];
  const uploadedFiles = [...uploadedMultiFiles, ...uploadedSingleFile];
  const mappedFiles = uploadedFiles.map((file, index) => ({
    id: createId('qf'),
    name: file.originalname,
    url: `/uploads/${file.filename}`,
    mimetype: file.mimetype,
    order: index + 1
  }));
  const firstFile = mappedFiles[0] || null;

  const quoteRequest = {
    id: createId('dmd'),
    clientId: req.user.id,
    serviceId,
    description: String(description).trim(),
    paletteCouleur: paletteCouleur ? String(paletteCouleur).trim() : '',
    paletteColorsJson: JSON.stringify(parseJsonArray(paletteColors)),
    inspiration: inspiration ? String(inspiration).trim() : '',
    inspirationLink: inspirationLink ? String(inspirationLink).trim() : '',
    contraintes: contraintes ? String(contraintes).trim() : '',
    serviceType: serviceType ? String(serviceType).trim() : service.name,
    budget: budget ? String(budget).trim() : '',
    deadline: deadline ? String(deadline).trim() : '',
    fileUrl: firstFile ? firstFile.url : '',
    fileName: firstFile ? firstFile.name : '',
    filesJson: JSON.stringify(mappedFiles),
    statut: 'EN_ATTENTE',
    assignedEmployeeId: null,
    assignedAt: null,
    assignmentAuto: null,
    studyJson: null,
    studySubmittedAt: null,
    finalEstimationJson: null,
    finalEstimationAt: null,
    clientNotified: 0,
    clientSeen: 0,
    clientSeenAt: null,
    dateCreation: mysqlNow()
  };

  await query(
    `INSERT INTO quote_requests (
      id, client_id, service_id, description, palette_couleur, inspiration, inspiration_link,
      contraintes, service_type, budget, deadline, file_url, file_name, files_json, palette_colors_json, statut,
      assigned_employee_id, assigned_at, assignment_auto, study_json, study_submitted_at,
      final_estimation_json, final_estimation_at, client_notified, client_seen, client_seen_at,
      date_creation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      quoteRequest.id,
      quoteRequest.clientId,
      quoteRequest.serviceId,
      quoteRequest.description,
      quoteRequest.paletteCouleur,
      quoteRequest.inspiration,
      quoteRequest.inspirationLink,
      quoteRequest.contraintes,
      quoteRequest.serviceType,
      quoteRequest.budget,
      quoteRequest.deadline,
      quoteRequest.fileUrl,
      quoteRequest.fileName,
      quoteRequest.filesJson,
      quoteRequest.paletteColorsJson,
      quoteRequest.statut,
      quoteRequest.assignedEmployeeId,
      quoteRequest.assignedAt,
      quoteRequest.assignmentAuto,
      quoteRequest.studyJson,
      quoteRequest.studySubmittedAt,
      quoteRequest.finalEstimationJson,
      quoteRequest.finalEstimationAt,
      quoteRequest.clientNotified,
      quoteRequest.clientSeen,
      quoteRequest.clientSeenAt,
      quoteRequest.dateCreation
    ]
  );

  const savedQuoteRequest = await findQuoteRequestById(quoteRequest.id);

  // Notify all admins
  try {
    const admins = await query('SELECT id FROM users WHERE role = ? AND suspended = 0', ['ADMIN']);
    for (const admin of admins) {
      await createNotification(admin.id, {
        type: 'devis',
        title: 'Nouvelle demande de devis',
        message: `${savedQuoteRequest?.clientName || 'Un client'} a soumis une nouvelle demande de devis.`,
        link: `/backoffice/devis/${quoteRequest.id}`
      });
    }
  } catch (_) {}

  return res.status(201).json({ quoteRequest: savedQuoteRequest || quoteRequest });
});

app.post('/api/contact', async (req, res) => {
  const { nomComplet, email, sujet, message } = req.body;
  if (!nomComplet || !email || !sujet || !message) {
    return res.status(400).json({ message: 'Tous les champs sont requis.' });
  }

  const contact = {
    id: createId('ctc'),
    nomComplet,
    email,
    sujet,
    message,
    date: mysqlNow()
  };
  await query(
    `INSERT INTO contact_messages (id, nom_complet, email, sujet, message, date_creation)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [contact.id, contact.nomComplet, contact.email, contact.sujet, contact.message, contact.date]
  );
  return res.status(201).json({ contact });
});

app.get('/api/contact', auth, authorize('ADMIN'), async (req, res) => {
  const rows = await query('SELECT * FROM contact_messages ORDER BY date_creation DESC');
  const contacts = rows.map((row) => ({
    id: row.id,
    nomComplet: row.nom_complet,
    email: row.email,
    sujet: row.sujet,
    message: row.message,
    date: row.date_creation
  }));
  return res.json({ contacts });
});

app.get('/api/quote-requests', auth, async (req, res) => {
  let rows;
  if (req.user.role === 'CLIENT') {
    rows = await query(
      `SELECT q.*, c.username AS client_username, e.username AS employee_username, s.name AS service_name
       FROM quote_requests q
       LEFT JOIN users c ON c.id = q.client_id
       LEFT JOIN users e ON e.id = q.assigned_employee_id
       LEFT JOIN services s ON s.id = q.service_id
       WHERE q.client_id = ?
       ORDER BY q.date_creation DESC`,
      [req.user.id]
    );
  } else if (req.user.role === 'EMPLOYE') {
    rows = await query(
      `SELECT q.*, c.username AS client_username, e.username AS employee_username, s.name AS service_name
       FROM quote_requests q
       LEFT JOIN users c ON c.id = q.client_id
       LEFT JOIN users e ON e.id = q.assigned_employee_id
       LEFT JOIN services s ON s.id = q.service_id
       WHERE q.assigned_employee_id = ?
       ORDER BY q.date_creation DESC`,
      [req.user.id]
    );
  } else {
    rows = await query(
      `SELECT q.*, c.username AS client_username, e.username AS employee_username, s.name AS service_name
       FROM quote_requests q
       LEFT JOIN users c ON c.id = q.client_id
       LEFT JOIN users e ON e.id = q.assigned_employee_id
       LEFT JOIN services s ON s.id = q.service_id
       ORDER BY q.date_creation DESC`
    );
  }
  const quoteRequests = rows.map(mapQuoteRequestRow);
  return res.json({ quoteRequests });
});

app.get('/api/quote-requests/notifications/count', auth, authorize('CLIENT'), async (req, res) => {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM quote_requests
     WHERE client_id = ? AND client_notified = 1 AND (client_seen IS NULL OR client_seen = 0)`,
    [req.user.id]
  );
  return res.json({ count: Number(rows[0]?.total || 0) });
});

app.patch('/api/quote-requests/mark-seen-all', auth, authorize('CLIENT'), async (req, res) => {
  await query(
    `UPDATE quote_requests
     SET client_seen = 1, client_seen_at = ?, client_notified = 0
     WHERE client_id = ? AND client_notified = 1`,
    [mysqlNow(), req.user.id]
  );
  return res.json({ success: true });
});

app.get('/api/quote-requests/:id', auth, async (req, res) => {
  const quoteRequest = await findQuoteRequestById(req.params.id);
  if (!quoteRequest) {
    return res.status(404).json({ message: 'Demande de devis introuvable.' });
  }

  if (!canAccessQuoteRequest(req.user, quoteRequest)) {
    return res.status(403).json({ message: 'Acces refuse a cette demande.' });
  }

  if (req.user.role === 'CLIENT' && quoteRequest.clientNotified && !quoteRequest.clientSeen) {
    await query(
      `UPDATE quote_requests
       SET client_seen = 1, client_seen_at = ?, client_notified = 0
       WHERE id = ?`,
      [mysqlNow(), quoteRequest.id]
    );
    const refreshed = await findQuoteRequestById(quoteRequest.id);
    return res.json({ quoteRequest: refreshed || quoteRequest });
  }

  return res.json({ quoteRequest });
});

app.patch('/api/quote-requests/:id/assign', auth, authorize('ADMIN'), async (req, res) => {
  const quoteRequest = await findQuoteRequestById(req.params.id);
  if (!quoteRequest) {
    return res.status(404).json({ message: 'Demande de devis introuvable.' });
  }

  if (quoteRequest.assignedEmployeeId) {
    return res.status(400).json({ message: 'Cette demande est deja affectee a un employe.' });
  }

  const { employeeId } = req.body || {};

  let selectedEmployee = null;
  let assignmentAuto = false;
  if (employeeId) {
    const employee = await findUserById(employeeId);
    if (!employee || employee.role !== 'EMPLOYE') {
      return res.status(404).json({ message: 'Employe introuvable.' });
    }
    selectedEmployee = employee;
  } else {
    selectedEmployee = await pickSuggestedEmployeeForQuote(quoteRequest);
    assignmentAuto = true;
  }

  if (!selectedEmployee) {
    return res.status(400).json({ message: 'Aucun employe disponible pour cette demande.' });
  }

  await query(
    `UPDATE quote_requests
     SET assigned_employee_id = ?, assigned_at = ?, assignment_auto = ?, statut = ?
     WHERE id = ?`,
    [selectedEmployee.id, mysqlNow(), assignmentAuto ? 1 : 0, 'AFFECTE', quoteRequest.id]
  );

  // Mark employee as unavailable
  await query('UPDATE users SET disponibilite = 0 WHERE id = ?', [selectedEmployee.id]);

  // Notify the assigned employee
  await createNotification(selectedEmployee.id, {
    type: 'devis',
    title: 'Nouvelle demande affectée',
    message: `Une demande de devis vous a été assignée.`,
    link: `/backoffice/devis/${quoteRequest.id}`
  });

  const updatedQuote = await findQuoteRequestById(quoteRequest.id);
  return res.json({ quoteRequest: updatedQuote });
});

app.patch('/api/quote-requests/:id/study', auth, authorize('EMPLOYE'), uploadFile.single('studyPdf'), async (req, res) => {
  const quoteRequest = await findQuoteRequestById(req.params.id);
  if (!quoteRequest) {
    return res.status(404).json({ message: 'Demande de devis introuvable.' });
  }

  if (quoteRequest.assignedEmployeeId !== req.user.id) {
    return res.status(403).json({ message: 'Cette demande ne vous est pas assignee.' });
  }

  // Check if study has already been submitted
  if (quoteRequest.study_json) {
    return res.status(400).json({ message: 'Une etude a deja ete soumise pour cette demande.' });
  }

    const { tasks, complexity, notes } = req.body || {};

    let parsedTasks = [];
    try { parsedTasks = JSON.parse(tasks || '[]'); } catch (_) { parsedTasks = []; }
    const validTasks = Array.isArray(parsedTasks) ? parsedTasks.filter((t) => t && String(t.name || '').trim()) : [];

    if (!validTasks.length) {
      return res.status(400).json({ message: 'Au moins une tache est requise.' });
    }

    const studyPdfUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const study = {
      tasks: validTasks.map((t) => ({
        name: String(t.name).trim(),
        hours: t.hours ? Number(t.hours) : null,
        days: t.days ? Number(t.days) : null
      })),
      complexity: complexity !== undefined ? Math.min(100, Math.max(0, Number(complexity))) : 50,
      notes: notes ? String(notes).trim() : '',
      studyPdfUrl,
      employeeId: req.user.id,
      submittedAt: mysqlNow()
    };

  await query(
    `UPDATE quote_requests
     SET study_json = ?, study_submitted_at = ?, statut = ?
     WHERE id = ?`,
    [JSON.stringify(study), mysqlNow(), 'ETUDE_ENVOYEE', quoteRequest.id]
  );

  // Mark employee as available again
  await query('UPDATE users SET disponibilite = 1 WHERE id = ?', [req.user.id]);

  // Notify all admins
  try {
    const admins = await query('SELECT id FROM users WHERE role = ? AND suspended = 0', ['ADMIN']);
    for (const admin of admins) {
      await createNotification(admin.id, {
        type: 'etude',
        title: 'Etude soumise',
        message: `L'employe a soumis une etude pour la demande de ${quoteRequest?.clientName || 'un client'}.`,
        link: `/backoffice/devis/${quoteRequest.id}`
      });
    }
  } catch (_) {}

  const updatedQuote = await findQuoteRequestById(quoteRequest.id);
  return res.json({ quoteRequest: updatedQuote });
});

app.patch('/api/quote-requests/:id/final-estimation', auth, authorize('ADMIN'), async (req, res) => {
  const quoteRequest = await findQuoteRequestById(req.params.id);
  if (!quoteRequest) {
    return res.status(404).json({ message: 'Demande de devis introuvable.' });
  }

  // Check if final estimation has already been submitted
  if (quoteRequest.final_estimation_json) {
    return res.status(400).json({ message: 'Une reponse a deja ete envoyee pour cette demande.' });
  }

  const { amount, breakdown, currency, deliveryDays } = req.body || {};
  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ message: 'Le montant est requis.' });
  }

  const finalEstimation = {
    amount: Number(amount),
    currency: currency ? String(currency).trim() : 'EUR',
    breakdown: breakdown ? String(breakdown).trim() : '',
    deliveryDays: deliveryDays ? Number(deliveryDays) : null,
    submittedAt: mysqlNow(),
    adminId: req.user.id
  };

  await query(
    `UPDATE quote_requests
     SET final_estimation_json = ?, final_estimation_at = ?, statut = ?, client_notified = 1, client_seen = 0, client_seen_at = NULL
     WHERE id = ?`,
    [JSON.stringify(finalEstimation), mysqlNow(), 'REPONDU', quoteRequest.id]
  );

  // Notify the client
  await createNotification(quoteRequest.clientId, {
    type: 'devis',
    title: 'Réponse à votre devis',
    message: 'Votre demande de devis a reçu une réponse. Consultez les détails.',
    link: `/mes-devis/${quoteRequest.id}`
  });

  const updatedQuote = await findQuoteRequestById(quoteRequest.id);
  return res.json({ quoteRequest: updatedQuote });
});

// ── Client response (ACCEPTE / REFUSE) ───────────────────────────────────────
app.patch('/api/quote-requests/:id/client-response', auth, authorize('CLIENT'), async (req, res) => {
  const quoteRequest = await findQuoteRequestById(req.params.id);
  if (!quoteRequest) return res.status(404).json({ message: 'Demande introuvable.' });
  if (quoteRequest.clientId !== req.user.id) return res.status(403).json({ message: 'Acces interdit.' });
  if (quoteRequest.statut !== 'REPONDU') return res.status(400).json({ message: 'La demande n\'a pas encore recu de reponse.' });
  if (quoteRequest.clientResponse) return res.status(400).json({ message: 'Vous avez deja repondu a cette demande.' });

  const { response } = req.body || {};
  if (response !== 'ACCEPTE' && response !== 'REFUSE') return res.status(400).json({ message: 'response doit etre ACCEPTE ou REFUSE.' });

  const newStatut = response === 'ACCEPTE' ? 'EN_ATTENTE_PAIEMENT' : 'REFUSE';
  await query('UPDATE quote_requests SET client_response = ?, statut = ? WHERE id = ?', [response, newStatut, quoteRequest.id]);

  // Notify admins
  try {
    const admins = await query('SELECT id FROM users WHERE role = ? AND suspended = 0', ['ADMIN']);
    for (const admin of admins) {
      await createNotification(admin.id, {
        type: 'devis',
        title: response === 'ACCEPTE' ? 'Devis accepte par le client' : 'Devis refuse par le client',
        message: `Le client a ${response === 'ACCEPTE' ? 'accepte' : 'refuse'} le devis.`,
        link: `/backoffice/devis/${quoteRequest.id}`
      });
    }
  } catch (_) {}

  const updatedQuote = await findQuoteRequestById(quoteRequest.id);
  return res.json({ quoteRequest: updatedQuote });
});

// ── Client deposit payment via Stripe ────────────────────────────────────────
app.post('/api/quote-requests/:id/pay-deposit', auth, authorize('CLIENT'), async (req, res) => {
  const quoteRequest = await findQuoteRequestById(req.params.id);
  if (!quoteRequest) return res.status(404).json({ message: 'Demande introuvable.' });
  if (quoteRequest.clientId !== req.user.id) return res.status(403).json({ message: 'Acces interdit.' });
  if (quoteRequest.statut !== 'EN_ATTENTE_PAIEMENT') return res.status(400).json({ message: 'Paiement non applicable pour ce statut.' });
  if (quoteRequest.depositPaid) return res.status(400).json({ message: 'Depot deja paye.' });

  const estimation = quoteRequest.finalEstimation;
  if (!estimation || !estimation.amount) return res.status(400).json({ message: 'Aucune estimation disponible.' });

  const depositAmount = Math.round(estimation.amount * 0.1 * 100); // cents

  if (!stripe) {
    return res.status(503).json({ message: 'Le paiement Stripe n\'est pas configure sur le serveur.' });
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: (estimation.currency || 'EUR').toLowerCase(),
        product_data: {
          name: `Acompte — ${quoteRequest.serviceType || 'Projet'}`,
          description: `10% d'acompte pour votre projet Ulysse Media (Réf. ${quoteRequest.id.slice(0, 8)})`,
        },
        unit_amount: depositAmount,
      },
      quantity: 1,
    }],
    metadata: { quoteId: quoteRequest.id, type: 'deposit' },
    success_url: `${FRONTEND_URL}/paiement/succes?session_id={CHECKOUT_SESSION_ID}&quoteId=${quoteRequest.id}`,
    cancel_url: `${FRONTEND_URL}/mes-devis/${quoteRequest.id}`,
  });

  // Save pending payment
  await query(
    'INSERT INTO payments (id, quote_id, stripe_session_id, amount_cents, currency, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [createId('pay'), quoteRequest.id, session.id, depositAmount, (estimation.currency || 'EUR').toUpperCase(), 'PENDING', mysqlNow()]
  );

  return res.json({ checkoutUrl: session.url, sessionId: session.id });
});

// ── Stripe Webhook ─────────────────────────────────────────────────────────────
app.post('/api/payments/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    if (STRIPE_WEBHOOK_SECRET && stripe) {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    return res.status(400).json({ message: `Webhook Error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { quoteId } = session.metadata || {};
    if (quoteId) {
      const quoteRequest = await findQuoteRequestById(quoteId);
      if (quoteRequest && !quoteRequest.depositPaid) {
        await query('UPDATE payments SET status = ? WHERE stripe_session_id = ?', ['PAID', session.id]);
        await activateDepositAndOpenChat(quoteRequest);
      }
    }
  }

  if (event.type === 'checkout.session.expired' || event.type === 'payment_intent.payment_failed') {
    const session = event.data.object;
    await query('UPDATE payments SET status = ? WHERE stripe_session_id = ?', ['FAILED', session.id]).catch(() => {});
  }

  return res.json({ received: true });
});

// ── Get payment status ─────────────────────────────────────────────────────────
app.get('/api/payments/verify', async (req, res) => {
  const { session_id, quoteId } = req.query;
  if (!session_id && !quoteId) return res.status(400).json({ message: 'session_id ou quoteId requis.' });

  // Prioritize session_id verification to avoid false negatives right after checkout redirect.
  if (session_id) {
    const rows = await query('SELECT * FROM payments WHERE stripe_session_id = ? LIMIT 1', [session_id]);
    const payment = rows[0];
    if (!payment && stripe) {
      try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        const quoteIdFromStripe = session?.metadata?.quoteId;
        if (session?.payment_status === 'paid' && quoteIdFromStripe) {
          const qr = await findQuoteRequestById(quoteIdFromStripe);
          if (qr && !qr.depositPaid) {
            await activateDepositAndOpenChat(qr);
          }
          return res.json({ paid: true, quoteId: quoteIdFromStripe });
        }
      } catch (_) {}
      return res.json({ paid: false });
    }

    if (!payment) return res.json({ paid: false });

    // If payment succeeded but webhook hasn't fired yet, verify with Stripe directly.
    if (payment.status !== 'PAID' && stripe) {
      try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        if (session.payment_status === 'paid') {
          const qr = await findQuoteRequestById(payment.quote_id);
          if (qr && !qr.depositPaid) {
            await query('UPDATE payments SET status = ? WHERE stripe_session_id = ?', ['PAID', session_id]);
            await activateDepositAndOpenChat(qr);
          }
          return res.json({ paid: true, quoteId: payment.quote_id });
        }
      } catch (_) {}
    }

    return res.json({ paid: payment.status === 'PAID', quoteId: payment.quote_id });
  }

  const qr = await findQuoteRequestById(quoteId);
  if (!qr) return res.status(404).json({ message: 'Demande introuvable.' });
  return res.json({ paid: qr.depositPaid, statut: qr.statut });
});

async function activateDepositAndOpenChat(quoteRequest) {
  await query('UPDATE quote_requests SET deposit_paid = 1, statut = ? WHERE id = ?', ['ACCEPTE', quoteRequest.id]);

  const channel = `quote_${quoteRequest.id}`;
  const welcome = {
    id: createId('msg'),
    channel,
    message: `Bienvenue chez Ulysse Media ! 🎉 Votre projet a officiellement démarré. Nous sommes ravis de travailler avec vous. N'hésitez pas à poser vos questions ici, votre chargé de projet vous accompagne.`,
    user_id: 'SYSTEM',
    username: 'Ulysse Media',
    created_at: mysqlNow()
  };
  await query(
    'INSERT INTO chat_messages (id, channel, message, user_id, username, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [welcome.id, welcome.channel, welcome.message, welcome.user_id, welcome.username, welcome.created_at]
  );

  const chatMsg = { id: welcome.id, channel, message: welcome.message, userId: 'SYSTEM', username: 'Ulysse Media', createdAt: welcome.created_at };
  emitToUser(quoteRequest.clientId, 'chat_message', chatMsg);
  if (quoteRequest.assignedEmployeeId) emitToUser(quoteRequest.assignedEmployeeId, 'chat_message', chatMsg);

  if (quoteRequest.assignedEmployeeId) {
    await createNotification(quoteRequest.assignedEmployeeId, {
      type: 'chat',
      title: 'Projet démarré',
      message: 'Le client a payé l\'acompte. Le chat est ouvert.',
      link: `/backoffice/devis/${quoteRequest.id}`
    });
  }
}

// ── Chat rooms per quote request ──────────────────────────────────────────────
app.get('/api/chat/rooms', auth, async (req, res) => {
  let rows;
  if (req.user.role === 'CLIENT') {
    rows = await query(
      `SELECT q.id as quote_id, q.service_type, q.statut, q.deposit_paid, q.assigned_employee_id,
              u.username as employee_name,
              (SELECT COUNT(*) FROM chat_messages WHERE channel = CONCAT('quote_', q.id)) as message_count
       FROM quote_requests q
       LEFT JOIN users u ON u.id = q.assigned_employee_id
       WHERE q.client_id = ? AND q.deposit_paid = 1`,
      [req.user.id]
    );
  } else if (req.user.role === 'EMPLOYE') {
    rows = await query(
      `SELECT q.id as quote_id, q.service_type, q.statut, q.deposit_paid, q.client_id,
              u.username as client_name,
              (SELECT COUNT(*) FROM chat_messages WHERE channel = CONCAT('quote_', q.id)) as message_count
       FROM quote_requests q
       LEFT JOIN users u ON u.id = q.client_id
       WHERE q.assigned_employee_id = ? AND q.deposit_paid = 1`,
      [req.user.id]
    );
  } else {
    // ADMIN can see all
    rows = await query(
      `SELECT q.id as quote_id, q.service_type, q.statut, q.deposit_paid, q.client_id, q.assigned_employee_id,
              uc.username as client_name, ue.username as employee_name,
              (SELECT COUNT(*) FROM chat_messages WHERE channel = CONCAT('quote_', q.id)) as message_count
       FROM quote_requests q
       LEFT JOIN users uc ON uc.id = q.client_id
       LEFT JOIN users ue ON ue.id = q.assigned_employee_id
       WHERE q.deposit_paid = 1`
    );
  }
  return res.json({ rooms: rows });
});

app.get('/api/chat/rooms/:quoteId/messages', auth, async (req, res) => {
  const channel = `quote_${req.params.quoteId}`;
  // Security: user must be client, assigned employee or admin for this quote
  const qr = await findQuoteRequestById(req.params.quoteId);
  if (!qr) return res.status(404).json({ message: 'Demande introuvable.' });
  if (req.user.role === 'CLIENT' && qr.clientId !== req.user.id) return res.status(403).json({ message: 'Acces interdit.' });
  if (req.user.role === 'EMPLOYE' && qr.assignedEmployeeId !== req.user.id) return res.status(403).json({ message: 'Acces interdit.' });

  const rows = await query('SELECT * FROM chat_messages WHERE channel = ? ORDER BY created_at ASC LIMIT 200', [channel]);
  return res.json({ messages: rows.map((r) => ({ id: r.id, channel: r.channel, message: r.message, userId: r.user_id, username: r.username, createdAt: r.created_at })) });
});

app.post('/api/chat/rooms/:quoteId/messages', auth, async (req, res) => {
  const channel = `quote_${req.params.quoteId}`;
  const qr = await findQuoteRequestById(req.params.quoteId);
  if (!qr) return res.status(404).json({ message: 'Demande introuvable.' });
  if (!qr.depositPaid) return res.status(400).json({ message: 'Le chat n\'est pas encore ouvert.' });
  if (req.user.role === 'CLIENT' && qr.clientId !== req.user.id) return res.status(403).json({ message: 'Acces interdit.' });
  if (req.user.role === 'EMPLOYE' && qr.assignedEmployeeId !== req.user.id) return res.status(403).json({ message: 'Acces interdit.' });

  const { message } = req.body || {};
  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) return res.status(400).json({ message: 'message requis.' });

  const msg = { id: createId('msg'), channel, message: cleanMessage, user_id: req.user.id, username: req.user.username, created_at: mysqlNow() };
  await query('INSERT INTO chat_messages (id, channel, message, user_id, username, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [msg.id, msg.channel, msg.message, msg.user_id, msg.username, msg.created_at]);

  const chatMsg = { id: msg.id, channel, message: msg.message, userId: msg.user_id, username: msg.username, createdAt: msg.created_at };
  // Emit to participants, sender, and admins so all open backoffice chats update live.
  emitToUser(qr.clientId, 'chat_message', chatMsg);
  if (qr.assignedEmployeeId) emitToUser(qr.assignedEmployeeId, 'chat_message', chatMsg);
  emitToUser(req.user.id, 'chat_message', chatMsg);
  try {
    const admins = await query('SELECT id FROM users WHERE role = ? AND suspended = 0', ['ADMIN']);
    admins.forEach((admin) => emitToUser(admin.id, 'chat_message', chatMsg));
  } catch (_) {}

  return res.status(201).json({ message: chatMsg });
});

// ── Notifications REST endpoints ──────────────────────────────────────────────
app.get('/api/notifications', auth, async (req, res) => {
  const rows = await query(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  );
  const notifications = rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link,
    read: !!row.read,
    createdAt: row.created_at
  }));
  return res.json({ notifications });
});

app.patch('/api/notifications/read-all', auth, async (req, res) => {
  await query('UPDATE notifications SET `read` = 1 WHERE user_id = ?', [req.user.id]);
  return res.json({ success: true });
});

app.patch('/api/notifications/:id/read', auth, async (req, res) => {
  await query('UPDATE notifications SET `read` = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  return res.json({ success: true });
});

app.get('/api/chat/messages', auth, async (req, res) => {
  const { channel = 'global' } = req.query;
  const rows = await query('SELECT * FROM chat_messages WHERE channel = ? ORDER BY created_at ASC', [channel]);
  const messages = rows.map((row) => ({
    id: row.id,
    channel: row.channel,
    message: row.message,
    userId: row.user_id,
    username: row.username,
    createdAt: row.created_at
  }));
  return res.json({ messages });
});

app.post('/api/chat/messages', auth, async (req, res) => {
  const { channel = 'global', message } = req.body;
  if (!message) {
    return res.status(400).json({ message: 'message requis.' });
  }
  const msg = {
    id: createId('msg'),
    channel,
    message,
    userId: req.user.id,
    username: req.user.username,
    createdAt: mysqlNow()
  };
  await query(
    `INSERT INTO chat_messages (id, channel, message, user_id, username, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [msg.id, msg.channel, msg.message, msg.userId, msg.username, msg.createdAt]
  );
  return res.status(201).json({ message: msg });
});

app.get('/api/google/auth-url', auth, authorize('ADMIN'), async (_req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    return res.status(400).json({ message: 'Configuration Google OAuth2 incomplete.' });
  }

  const oauthClient = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  const url = oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar']
  });

  return res.json({ url });
});

app.get('/api/google/oauth2/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ message: 'code requis.' });
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    return res.status(400).json({ message: 'Configuration Google OAuth2 incomplete.' });
  }

  try {
    const oauthClient = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    const { tokens } = await oauthClient.getToken(String(code));
    return res.json({
      message: 'OAuth2 configure. Copiez refresh_token dans GOOGLE_REFRESH_TOKEN.',
      refreshToken: tokens.refresh_token || null,
      accessToken: tokens.access_token || null,
      expiryDate: tokens.expiry_date || null
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Impossible de finaliser OAuth2.' });
  }
});

app.get('/api/events/participants', auth, authorize('ADMIN', 'EMPLOYE'), async (_req, res) => {
  const rows = await query(
    'SELECT id, username, email FROM users WHERE role = ? AND suspended = 0 ORDER BY username ASC',
    ['CLIENT']
  );
  return res.json({ participants: rows.map((row) => ({ id: row.id, username: row.username, email: row.email })) });
});

app.get('/api/events', auth, async (req, res) => {
  let rows = [];
  if (req.user.role === 'CLIENT') {
    rows = await query(
      `SELECT m.*, u.username AS client_name, u.email AS client_email
       FROM meetings m
       LEFT JOIN users u ON u.id = m.client_user_id
       WHERE m.client_user_id = ?
       ORDER BY m.start_date ASC`,
      [req.user.id]
    );
  } else if (req.user.role === 'EMPLOYE') {
    rows = await query(
      `SELECT m.*, u.username AS client_name, u.email AS client_email
       FROM meetings m
       LEFT JOIN users u ON u.id = m.client_user_id
       WHERE m.created_by = ?
       ORDER BY m.start_date ASC`,
      [req.user.id]
    );
  } else {
    rows = await query(
      `SELECT m.*, u.username AS client_name, u.email AS client_email
       FROM meetings m
       LEFT JOIN users u ON u.id = m.client_user_id
       ORDER BY m.start_date ASC`
    );
  }

  return res.json({ events: rows.map(mapMeetingRow) });
});

app.post('/api/events', auth, authorize('ADMIN', 'EMPLOYE'), async (req, res) => {
  const { title, description, start, end, timezone, clientUserId } = req.body || {};
  if (!title || !start || !end || !clientUserId) {
    return res.status(400).json({ message: 'title, start, end, clientUserId requis.' });
  }

  const startDate = parseDateInput(start);
  const endDate = parseDateInput(end);
  if (!startDate || !endDate || endDate <= startDate) {
    return res.status(400).json({ message: 'Dates invalides.' });
  }

  const organizer = await findUserById(req.user.id);
  const client = await findUserById(clientUserId);
  if (!organizer || !organizer.email) return res.status(404).json({ message: 'Organisateur introuvable.' });
  if (!client || client.role !== 'CLIENT' || !client.email) return res.status(404).json({ message: 'Client introuvable.' });

  const eventId = createId('meet');
  const tz = timezone || 'Europe/Paris';
  const startSql = startDate.toISOString().slice(0, 19).replace('T', ' ');
  const endSql = endDate.toISOString().slice(0, 19).replace('T', ' ');

  await query(
    `INSERT INTO meetings (
      id, title, description, start_date, end_date, timezone, created_by, client_user_id,
      status, sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [eventId, String(title).trim(), description ? String(description).trim() : '', startSql, endSql, tz, req.user.id, client.id, 'SCHEDULED', 'PENDING', mysqlNow(), mysqlNow()]
  );

  try {
    if (!isGoogleCalendarConfigured()) {
      throw new Error('Google Calendar n\'est pas configure sur le serveur.');
    }

    const attendeeEmails = [...new Set([organizer.email, client.email])];
    const { googleEventId, meetLink } = await createGoogleMeetingEvent({
      title: String(title).trim(),
      description: description ? String(description).trim() : '',
      startIso: startDate.toISOString(),
      endIso: endDate.toISOString(),
      timezone: tz,
      attendeeEmails,
      requestId: `${eventId}_${Date.now()}`
    });

    await query(
      'UPDATE meetings SET google_event_id = ?, meet_link = ?, sync_status = ?, updated_at = ? WHERE id = ?',
      [googleEventId, meetLink, 'SYNCED', mysqlNow(), eventId]
    );

    const rows = await query(
      `SELECT m.*, u.username AS client_name, u.email AS client_email
       FROM meetings m
       LEFT JOIN users u ON u.id = m.client_user_id
       WHERE m.id = ? LIMIT 1`,
      [eventId]
    );

    return res.status(201).json({ event: mapMeetingRow(rows[0]) });
  } catch (error) {
    await query(
      'UPDATE meetings SET sync_status = ?, last_sync_error = ?, updated_at = ? WHERE id = ?',
      ['FAILED', error.message || 'Erreur de synchronisation Google Calendar', mysqlNow(), eventId]
    );
    return res.status(502).json({ message: error.message || 'Impossible de creer la reunion Google Meet.' });
  }
});

app.put('/api/events/:id', auth, authorize('ADMIN', 'EMPLOYE'), async (req, res) => {
  const rows = await query('SELECT * FROM meetings WHERE id = ? LIMIT 1', [req.params.id]);
  const event = rows[0];
  if (!event) return res.status(404).json({ message: 'Evenement introuvable.' });

  const canEdit = req.user.role === 'ADMIN' || event.created_by === req.user.id;
  if (!canEdit) return res.status(403).json({ message: 'Acces interdit.' });
  if (event.status === 'CANCELED') return res.status(400).json({ message: 'Evenement deja annule.' });

  const nextTitle = req.body?.title ? String(req.body.title).trim() : event.title;
  const nextDescription = req.body?.description !== undefined ? String(req.body.description || '').trim() : (event.description || '');
  const nextTimezone = req.body?.timezone || event.timezone || 'Europe/Paris';
  const nextStart = req.body?.start ? parseDateInput(req.body.start) : new Date(event.start_date);
  const nextEnd = req.body?.end ? parseDateInput(req.body.end) : new Date(event.end_date);

  if (!nextTitle || !nextStart || !nextEnd || nextEnd <= nextStart) {
    return res.status(400).json({ message: 'Donnees invalides pour la mise a jour.' });
  }

  const organizer = await findUserById(event.created_by);
  const client = await findUserById(event.client_user_id);
  if (!organizer?.email || !client?.email) return res.status(400).json({ message: 'Participants introuvables.' });

  await query(
    `UPDATE meetings
     SET title = ?, description = ?, start_date = ?, end_date = ?, timezone = ?, sync_status = ?, updated_at = ?
     WHERE id = ?`,
    [
      nextTitle,
      nextDescription,
      nextStart.toISOString().slice(0, 19).replace('T', ' '),
      nextEnd.toISOString().slice(0, 19).replace('T', ' '),
      nextTimezone,
      'PENDING',
      mysqlNow(),
      event.id
    ]
  );

  try {
    const attendeeEmails = [...new Set([organizer.email, client.email])];

    if (!event.google_event_id) {
      const { googleEventId, meetLink } = await createGoogleMeetingEvent({
        title: nextTitle,
        description: nextDescription,
        startIso: nextStart.toISOString(),
        endIso: nextEnd.toISOString(),
        timezone: nextTimezone,
        attendeeEmails,
        requestId: `${event.id}_${Date.now()}`
      });

      await query(
        'UPDATE meetings SET google_event_id = ?, meet_link = ?, sync_status = ?, last_sync_error = NULL, updated_at = ? WHERE id = ?',
        [googleEventId, meetLink, 'SYNCED', mysqlNow(), event.id]
      );
    } else {
      const { meetLink } = await updateGoogleMeetingEvent({
        googleEventId: event.google_event_id,
        title: nextTitle,
        description: nextDescription,
        startIso: nextStart.toISOString(),
        endIso: nextEnd.toISOString(),
        timezone: nextTimezone,
        attendeeEmails
      });

      await query(
        'UPDATE meetings SET meet_link = ?, sync_status = ?, last_sync_error = NULL, updated_at = ? WHERE id = ?',
        [meetLink, 'SYNCED', mysqlNow(), event.id]
      );
    }
  } catch (error) {
    await query(
      'UPDATE meetings SET sync_status = ?, last_sync_error = ?, updated_at = ? WHERE id = ?',
      ['FAILED', error.message || 'Erreur de synchronisation Google Calendar', mysqlNow(), event.id]
    );
    return res.status(502).json({ message: error.message || 'Impossible de mettre a jour la reunion Google Meet.' });
  }

  const updatedRows = await query(
    `SELECT m.*, u.username AS client_name, u.email AS client_email
     FROM meetings m
     LEFT JOIN users u ON u.id = m.client_user_id
     WHERE m.id = ? LIMIT 1`,
    [event.id]
  );

  return res.json({ event: mapMeetingRow(updatedRows[0]) });
});

app.delete('/api/events/:id', auth, authorize('ADMIN', 'EMPLOYE'), async (req, res) => {
  const rows = await query('SELECT * FROM meetings WHERE id = ? LIMIT 1', [req.params.id]);
  const event = rows[0];
  if (!event) return res.status(404).json({ message: 'Evenement introuvable.' });

  const canDelete = req.user.role === 'ADMIN' || event.created_by === req.user.id;
  if (!canDelete) return res.status(403).json({ message: 'Acces interdit.' });
  if (event.status === 'CANCELED') return res.json({ success: true, alreadyCanceled: true });

  await query(
    'UPDATE meetings SET status = ?, sync_status = ?, updated_at = ? WHERE id = ?',
    ['CANCELED', 'PENDING', mysqlNow(), event.id]
  );

  try {
    if (event.google_event_id) {
      await cancelGoogleMeetingEvent(event.google_event_id);
    }

    await query(
      'UPDATE meetings SET sync_status = ?, last_sync_error = NULL, updated_at = ? WHERE id = ?',
      ['SYNCED', mysqlNow(), event.id]
    );
  } catch (error) {
    await query(
      'UPDATE meetings SET sync_status = ?, last_sync_error = ?, updated_at = ? WHERE id = ?',
      ['FAILED', error.message || 'Erreur de synchronisation Google Calendar', mysqlNow(), event.id]
    );
    return res.status(502).json({ message: error.message || 'Impossible d\'annuler la reunion Google Meet.' });
  }

  return res.json({ success: true });
});

// Backward-compatible aliases
app.get('/api/calendar/events', auth, async (req, res) => {
  let rows = [];
  if (req.user.role === 'CLIENT') {
    rows = await query(
      `SELECT m.*, u.username AS client_name, u.email AS client_email
       FROM meetings m
       LEFT JOIN users u ON u.id = m.client_user_id
       WHERE m.client_user_id = ?
       ORDER BY m.start_date ASC`,
      [req.user.id]
    );
  } else if (req.user.role === 'EMPLOYE') {
    rows = await query(
      `SELECT m.*, u.username AS client_name, u.email AS client_email
       FROM meetings m
       LEFT JOIN users u ON u.id = m.client_user_id
       WHERE m.created_by = ?
       ORDER BY m.start_date ASC`,
      [req.user.id]
    );
  } else {
    rows = await query(
      `SELECT m.*, u.username AS client_name, u.email AS client_email
       FROM meetings m
       LEFT JOIN users u ON u.id = m.client_user_id
       ORDER BY m.start_date ASC`
    );
  }
  return res.json({ events: rows.map(mapMeetingRow) });
});

app.post('/api/calendar/events', auth, authorize('ADMIN', 'EMPLOYE'), async (req, res) => {
  return res.status(400).json({ message: 'Utilisez /api/events avec clientUserId pour creer une reunion.' });
});

app.use((error, _req, res, _next) => {
  return res.status(500).json({ message: error.message || 'Erreur serveur.' });
});

async function bootstrapMySql() {
  const bootstrapConnection = await mysql.createConnection({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    multipleStatements: true
  });

  await bootstrapConnection.query(`CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await bootstrapConnection.end();

  db = await mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('ADMIN', 'EMPLOYE', 'CLIENT') NOT NULL,
      suspended TINYINT(1) NOT NULL DEFAULT 0,
      specialite VARCHAR(255) NULL,
      disponibilite TINYINT(1) NULL,
      taux_horaire DOUBLE NULL,
      niveau VARCHAR(120) NULL,
      tel VARCHAR(60) NULL,
      address VARCHAR(255) NULL,
      created_at DATETIME NOT NULL,
      created_by VARCHAR(64) NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS quote_requests (
      id VARCHAR(64) PRIMARY KEY,
      client_id VARCHAR(64) NOT NULL,
      service_id VARCHAR(64) NULL,
      description TEXT NOT NULL,
      palette_couleur VARCHAR(255) NULL,
      inspiration TEXT NULL,
      inspiration_link VARCHAR(500) NULL,
      contraintes TEXT NULL,
      service_type VARCHAR(60) NOT NULL,
      budget VARCHAR(120) NULL,
      deadline VARCHAR(120) NULL,
      file_url VARCHAR(500) NULL,
      file_name VARCHAR(255) NULL,
      files_json LONGTEXT NULL,
      palette_colors_json LONGTEXT NULL,
      statut VARCHAR(60) NOT NULL,
      assigned_employee_id VARCHAR(64) NULL,
      assigned_at DATETIME NULL,
      assignment_auto TINYINT(1) NULL,
      study_json LONGTEXT NULL,
      study_submitted_at DATETIME NULL,
      final_estimation_json LONGTEXT NULL,
      final_estimation_at DATETIME NULL,
      client_notified TINYINT(1) NOT NULL DEFAULT 0,
      client_seen TINYINT(1) NOT NULL DEFAULT 0,
      client_seen_at DATETIME NULL,
      date_creation DATETIME NOT NULL,
      INDEX idx_quote_client (client_id)
    )
  `);

  await ensureColumnIfMissing('quote_requests', 'service_id', 'VARCHAR(64) NULL');
  await ensureColumnIfMissing('quote_requests', 'inspiration_link', 'VARCHAR(500) NULL');
  await ensureColumnIfMissing('quote_requests', 'budget', 'VARCHAR(120) NULL');
  await ensureColumnIfMissing('quote_requests', 'deadline', 'VARCHAR(120) NULL');
  await ensureColumnIfMissing('quote_requests', 'file_url', 'VARCHAR(500) NULL');
  await ensureColumnIfMissing('quote_requests', 'file_name', 'VARCHAR(255) NULL');
  await ensureColumnIfMissing('quote_requests', 'files_json', 'LONGTEXT NULL');
  await ensureColumnIfMissing('quote_requests', 'palette_colors_json', 'LONGTEXT NULL');
  await ensureColumnIfMissing('quote_requests', 'assigned_employee_id', 'VARCHAR(64) NULL');
  await ensureColumnIfMissing('quote_requests', 'assigned_at', 'DATETIME NULL');
  await ensureColumnIfMissing('quote_requests', 'assignment_auto', 'TINYINT(1) NULL');
  await ensureColumnIfMissing('quote_requests', 'study_json', 'LONGTEXT NULL');
  await ensureColumnIfMissing('quote_requests', 'study_submitted_at', 'DATETIME NULL');
  await ensureColumnIfMissing('quote_requests', 'final_estimation_json', 'LONGTEXT NULL');
  await ensureColumnIfMissing('quote_requests', 'final_estimation_at', 'DATETIME NULL');
  await ensureColumnIfMissing('quote_requests', 'client_notified', 'TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumnIfMissing('quote_requests', 'client_seen', 'TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumnIfMissing('quote_requests', 'client_seen_at', 'DATETIME NULL');
  await ensureColumnIfMissing('quote_requests', 'client_response', 'VARCHAR(20) NULL');
  await ensureColumnIfMissing('quote_requests', 'deposit_paid', 'TINYINT(1) NOT NULL DEFAULT 0');

  await query(`
    CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(64) PRIMARY KEY,
      quote_id VARCHAR(64) NOT NULL,
      stripe_session_id VARCHAR(255) NULL,
      amount_cents INT NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      created_at DATETIME NOT NULL,
      INDEX idx_pay_quote (quote_id),
      INDEX idx_pay_session (stripe_session_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      type VARCHAR(32) NOT NULL DEFAULT 'info',
      title VARCHAR(255) NOT NULL,
      message TEXT NULL,
      link VARCHAR(500) NULL,
      \`read\` TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      INDEX idx_notif_user (user_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS services (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(190) NOT NULL,
      category VARCHAR(120) NULL,
      description TEXT NOT NULL,
      cover_image VARCHAR(500) NULL,
      starting_price DOUBLE NULL,
      price_note VARCHAR(255) NULL,
      timeline_range VARCHAR(190) NULL,
      included_json TEXT NULL,
      portfolio_id VARCHAR(64) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);

  await ensureColumnIfMissing('services', 'portfolio_id', 'VARCHAR(64) NULL');

  await query(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      assets_json LONGTEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS service_portfolio (
      id VARCHAR(64) PRIMARY KEY,
      service_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      image_url VARCHAR(500) NOT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_portfolio_service (service_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id VARCHAR(64) PRIMARY KEY,
      nom_complet VARCHAR(150) NOT NULL,
      email VARCHAR(190) NOT NULL,
      sujet VARCHAR(120) NOT NULL,
      message TEXT NOT NULL,
      date_creation DATETIME NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id VARCHAR(64) PRIMARY KEY,
      channel VARCHAR(120) NOT NULL,
      message TEXT NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      username VARCHAR(120) NOT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_chat_channel (channel)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      start_date DATETIME NOT NULL,
      end_date DATETIME NOT NULL,
      created_by VARCHAR(64) NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS meetings (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      start_date DATETIME NOT NULL,
      end_date DATETIME NOT NULL,
      timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Paris',
      created_by VARCHAR(64) NOT NULL,
      client_user_id VARCHAR(64) NOT NULL,
      google_event_id VARCHAR(255) NULL,
      meet_link TEXT NULL,
      status ENUM('SCHEDULED', 'CANCELED') NOT NULL DEFAULT 'SCHEDULED',
      sync_status ENUM('PENDING', 'SYNCED', 'FAILED') NOT NULL DEFAULT 'PENDING',
      last_sync_error TEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_meetings_start (start_date),
      INDEX idx_meetings_client (client_user_id),
      INDEX idx_meetings_creator (created_by),
      UNIQUE KEY uq_meetings_google_event (google_event_id)
    )
  `);

  const adminRows = await query('SELECT id FROM users WHERE email = ? LIMIT 1', ['admin@ulysse-media.fr']);
  if (!adminRows.length) {
    const hashedPassword = await bcrypt.hash('Admin123!', 10);
    await query(
      `INSERT INTO users (
        id, username, email, password_hash, role, suspended, niveau, created_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [createId('usr'), 'superadmin', 'admin@ulysse-media.fr', hashedPassword, 'ADMIN', 0, 'SUPER_ADMIN', new Date(), 'SYSTEM']
    );
  }

  const serviceRows = await query('SELECT id FROM services LIMIT 1');
  if (!serviceRows.length) {
    const defaultPortfolioId = createId('pfl');
    await query(
      `INSERT INTO portfolios (id, title, description, assets_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        defaultPortfolioId,
        'Portfolio Identite Visuelle',
        'Exemples de references et anciens projets pour ce service.',
        JSON.stringify([
          {
            id: createId('ast'),
            label: 'Moodboard Brand Identity',
            type: 'image',
            url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200'
          },
          {
            id: createId('ast'),
            label: 'Presentation PDF',
            type: 'pdf',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
          },
          {
            id: createId('ast'),
            label: 'Projet Behance',
            type: 'link',
            url: 'https://www.behance.net/'
          }
        ]),
        mysqlNow(),
        mysqlNow()
      ]
    );

    await query(
      `INSERT INTO services (
        id, name, category, description, cover_image, starting_price,
        price_note, timeline_range, included_json, portfolio_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        createId('svc'),
        'Identite visuelle complete',
        'Design Graphique',
        'Creation d\'une identite visuelle premium pour votre marque.',
        'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200',
        1200,
        'a partir de',
        '2 a 4 semaines',
        JSON.stringify(['Logo', 'Carte de visite', 'Charte graphique']),
        defaultPortfolioId,
        mysqlNow(),
        mysqlNow()
      ]
    );
  }
}

bootstrapMySql()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`API Ulysse Media + MySQL (${MYSQL_DATABASE}) + Socket.IO démarrée sur le port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Erreur de démarrage MySQL:', error.message);
    process.exit(1);
  });