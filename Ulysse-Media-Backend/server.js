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

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || '').trim()).filter(Boolean);
      }
    } catch (_error) {
      return value.split('\n').map((item) => item.trim()).filter(Boolean);
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
    projectStatus: row.project_status || 'NOT_STARTED',
    projectCompletionPercent: Number(row.project_completion_percent || 0),
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
    projectId: row.project_id || null,
    clientEmail: row.client_email || null,
    clientName: row.client_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapProjectSummaryRow(row) {
  return {
    id: row.id,
    name: row.service_name || row.service_type || 'Projet',
    description: row.description || '',
    status: row.statut,
    projectStatus: row.project_status || 'NOT_STARTED',
    completionPercent: Number(row.project_completion_percent || 0),
    clientId: row.client_id,
    clientName: row.client_username || null,
    assignedEmployeeId: row.assigned_employee_id || null,
    assignedEmployeeName: row.employee_username || null,
    depositPaid: !!row.deposit_paid,
    deadline: row.deadline || null,
    createdAt: row.date_creation,
    taskStats: {
      total: Number(row.tasks_total || 0),
      toDo: Number(row.tasks_todo || 0),
      doing: Number(row.tasks_doing || 0),
      ready: Number(row.tasks_ready || 0)
    }
  };
}

function mapProjectTaskRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description || '',
    status: row.status,
    assignedEmployeeId: row.assigned_employee_id || null,
    assignedEmployeeName: row.assigned_employee_name || null,
    meetingId: row.meeting_id || null,
    milestoneId: row.milestone_id || null,
    deadline: row.deadline || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMilestoneRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description || '',
    amountCents: Number(row.amount_cents || 0),
    percent: Number(row.percent || 0),
    orderIndex: Number(row.order_index || 0),
    status: row.status,
    validationMeetingId: row.validation_meeting_id || null,
    dueDate: row.due_date || null,
    paidAt: row.paid_at || null,
    paymentId: row.payment_id || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMeetingReportRow(row) {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    projectId: row.project_id,
    summary: row.summary || '',
    decisions: parseJsonArray(row.decisions_json),
    blockers: parseJsonArray(row.blockers_json),
    actionItems: parseJsonArray(row.action_items_json),
    nextSteps: parseJsonArray(row.next_steps_json),
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDeliverableRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description || '',
    fileUrl: row.file_url || null,
    fileName: row.file_name || null,
    locked: !!row.locked,
    visibleToClient: !!row.visible_to_client,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function canAccessProject(user, projectRow) {
  if (!user || !projectRow) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'EMPLOYE') return projectRow.assigned_employee_id === user.id;
  if (user.role === 'CLIENT') return projectRow.client_id === user.id;
  return false;
}

function canManageProjectTasks(user, projectRow) {
  if (!user || !projectRow) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'EMPLOYE') return projectRow.assigned_employee_id === user.id;
  return false;
}

function canManageProjectWorkflow(user, projectRow) {
  return canManageProjectTasks(user, projectRow);
}

async function findProjectById(projectId) {
  const rows = await query(
    `SELECT q.*, c.username AS client_username, e.username AS employee_username, s.name AS service_name
     FROM quote_requests q
     LEFT JOIN users c ON c.id = q.client_id
     LEFT JOIN users e ON e.id = q.assigned_employee_id
     LEFT JOIN services s ON s.id = q.service_id
     WHERE q.id = ?
     LIMIT 1`,
    [projectId]
  );
  return rows[0] || null;
}

async function resolveProjectFromMeeting(meeting, fallbackProjectId = null) {
  if (meeting?.project_id) {
    return findProjectById(meeting.project_id);
  }

  if (!fallbackProjectId) {
    return null;
  }

  const project = await findProjectById(fallbackProjectId);
  if (!project) return null;
  if (project.client_id !== meeting.client_user_id) return null;

  // Backfill legacy meetings so future calls resolve immediately.
  await query('UPDATE meetings SET project_id = ?, updated_at = ? WHERE id = ?', [project.id, mysqlNow(), meeting.id]);
  return project;
}

async function getProjectFinancialSummary(projectId) {
  const milestoneRows = await query(
    `SELECT id, amount_cents, percent, status
     FROM project_milestones
     WHERE project_id = ?
     ORDER BY order_index ASC, created_at ASC`,
    [projectId]
  );

  const quoteRows = await query(
    `SELECT final_estimation_json, deposit_paid, kickoff_paid
     FROM quote_requests
     WHERE id = ?
     LIMIT 1`,
    [projectId]
  );
  const quote = quoteRows[0] || null;
  const estimation = quote ? parseJsonObject(quote.final_estimation_json) : null;
  const rawEstimateAmount = Number(estimation?.amount);
  const totalFromEstimate = Number.isFinite(rawEstimateAmount) && rawEstimateAmount > 0
    ? Math.round(rawEstimateAmount * 100)
    : 0;
  const totalFromMilestones = milestoneRows.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  // Use quote estimation as authoritative project total when available.
  const totalCents = totalFromEstimate || totalFromMilestones || 0;

  let paidCents = 0;
  if (quote?.deposit_paid && totalCents > 0) {
    paidCents += Math.round(totalCents * 0.1);
  }
  if (quote?.kickoff_paid && totalCents > 0) {
    paidCents += Math.round(totalCents * 0.2);
  }
  paidCents += milestoneRows
    .filter((row) => row.status === 'PAID')
    .reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);

  const effectivePaidCents = totalCents > 0 ? Math.min(totalCents, paidCents) : paidCents;

  const paidPercent = totalCents > 0 ? Math.min(100, Math.round((effectivePaidCents / totalCents) * 100)) : 0;
  return {
    totalCents,
    paidCents: effectivePaidCents,
    paidPercent,
    milestonesCount: milestoneRows.length,
    paidMilestonesCount: milestoneRows.filter((row) => row.status === 'PAID').length,
    depositPaid: !!quote?.deposit_paid,
    kickoffPaid: !!quote?.kickoff_paid
  };
}

async function syncProjectProgress(projectId, preferredStatus = null) {
  const financial = await getProjectFinancialSummary(projectId);
  const nextStatus = preferredStatus || (financial.paidPercent >= 100 ? 'DELIVERY_READY' : 'IN_PROGRESS');

  await query(
    `UPDATE quote_requests
     SET project_completion_percent = ?, project_status = ?, statut = CASE
       WHEN ? = 'DELIVERY_READY' THEN 'ACCEPTE'
       ELSE statut
     END
     WHERE id = ?`,
    [financial.paidPercent, nextStatus, nextStatus, projectId]
  );

  return { ...financial, projectStatus: nextStatus };
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
    const { quoteId, type, milestoneId, projectId } = session.metadata || {};

    if (type === 'milestone' && milestoneId && projectId) {
      await query('UPDATE payments SET status = ? WHERE stripe_session_id = ?', ['PAID', session.id]);
      await query(
        `UPDATE project_milestones
         SET status = 'PAID', paid_at = ?, payment_id = ?, updated_at = ?
         WHERE id = ? AND project_id = ?`,
        [mysqlNow(), session.id, mysqlNow(), milestoneId, projectId]
      );
      await syncProjectProgress(projectId);
    } else if (type === 'kickoff20' && projectId) {
      await query('UPDATE payments SET status = ? WHERE stripe_session_id = ?', ['PAID', session.id]);
      await query('UPDATE quote_requests SET kickoff_paid = 1 WHERE id = ?', [projectId]);
      await syncProjectProgress(projectId);
    } else if (quoteId) {
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
    if (session?.metadata?.type === 'milestone' && session?.metadata?.milestoneId) {
      await query(
        `UPDATE project_milestones
         SET status = 'FAILED', updated_at = ?
         WHERE id = ?`,
        [mysqlNow(), session.metadata.milestoneId]
      ).catch(() => {});
    }
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
        const quoteIdFromStripe = session?.metadata?.quoteId || null;
        const projectIdFromStripe = session?.metadata?.projectId || quoteIdFromStripe;
        const paymentType = String(session?.metadata?.type || '').toLowerCase();

        if (session?.payment_status === 'paid') {
          if (paymentType === 'kickoff20' && projectIdFromStripe) {
            await query('UPDATE quote_requests SET kickoff_paid = 1 WHERE id = ?', [projectIdFromStripe]).catch(() => {});
            await syncProjectProgress(projectIdFromStripe).catch(() => {});
            return res.json({ paid: true, quoteId: quoteIdFromStripe, projectId: projectIdFromStripe, paymentType: 'KICKOFF20' });
          }

          if (paymentType === 'milestone' && projectIdFromStripe && session?.metadata?.milestoneId) {
            await query(
              `UPDATE project_milestones
               SET status = 'PAID', paid_at = ?, payment_id = ?, updated_at = ?
               WHERE id = ? AND project_id = ?`,
              [mysqlNow(), session.id, mysqlNow(), session.metadata.milestoneId, projectIdFromStripe]
            ).catch(() => {});
            await syncProjectProgress(projectIdFromStripe).catch(() => {});
            return res.json({ paid: true, quoteId: quoteIdFromStripe, projectId: projectIdFromStripe, paymentType: 'MILESTONE' });
          }

          if (quoteIdFromStripe) {
            const qr = await findQuoteRequestById(quoteIdFromStripe);
            if (qr && !qr.depositPaid) {
              await activateDepositAndOpenChat(qr);
            }
            return res.json({ paid: true, quoteId: quoteIdFromStripe, projectId: quoteIdFromStripe, paymentType: 'DEPOSIT' });
          }

          return res.json({ paid: true, paymentType: paymentType || 'UNKNOWN' });
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
          const metadataType = String(session?.metadata?.type || '').toLowerCase();
          const paymentType = metadataType || String(payment.payment_type || '').toLowerCase();
          await query('UPDATE payments SET status = ? WHERE stripe_session_id = ?', ['PAID', session_id]);

          if (paymentType === 'kickoff20') {
            await query('UPDATE quote_requests SET kickoff_paid = 1 WHERE id = ?', [payment.quote_id]);
            await syncProjectProgress(payment.quote_id);
            return res.json({ paid: true, quoteId: payment.quote_id, projectId: payment.quote_id, paymentType: 'KICKOFF20' });
          }

          if (paymentType === 'milestone') {
            const milestoneId = session?.metadata?.milestoneId || payment.milestone_id;
            if (milestoneId) {
              await query(
                `UPDATE project_milestones
                 SET status = 'PAID', paid_at = ?, payment_id = ?, updated_at = ?
                 WHERE id = ? AND project_id = ?`,
                [mysqlNow(), session_id, mysqlNow(), milestoneId, payment.quote_id]
              );
            }
            await syncProjectProgress(payment.quote_id);
            return res.json({ paid: true, quoteId: payment.quote_id, projectId: payment.quote_id, paymentType: 'MILESTONE' });
          }

          const qr = await findQuoteRequestById(payment.quote_id);
          if (qr && !qr.depositPaid) {
            await activateDepositAndOpenChat(qr);
          }
          return res.json({ paid: true, quoteId: payment.quote_id, projectId: payment.quote_id, paymentType: 'DEPOSIT' });
        }
      } catch (_) {}
    }

    return res.json({
      paid: payment.status === 'PAID',
      quoteId: payment.quote_id,
      projectId: payment.quote_id,
      paymentType: payment.payment_type || 'DEPOSIT'
    });
  }

  const qr = await findQuoteRequestById(quoteId);
  if (!qr) return res.status(404).json({ message: 'Demande introuvable.' });
  return res.json({ paid: qr.depositPaid, statut: qr.statut });
});

async function activateDepositAndOpenChat(quoteRequest) {
  await query(
    'UPDATE quote_requests SET deposit_paid = 1, statut = ?, project_status = ?, project_completion_percent = GREATEST(project_completion_percent, 10) WHERE id = ?',
    ['ACCEPTE', 'IN_PROGRESS', quoteRequest.id]
  );

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

async function buildProjectFolderPayload(project, user) {
  const [
    tasksRows,
    meetingsRows,
    milestonesRows,
    reportsRows,
    deliverablesRows,
    reportAttachmentsRows
  ] = await Promise.all([
    query(
      `SELECT t.*, u.username AS assigned_employee_name
       FROM project_tasks t
       LEFT JOIN users u ON u.id = t.assigned_employee_id
       WHERE t.project_id = ?
       ORDER BY FIELD(t.status, 'TO_DO', 'DOING', 'READY'), t.updated_at DESC`,
      [project.id]
    ),
    query(
      `SELECT m.*, u.username AS client_name, u.email AS client_email
       FROM meetings m
       LEFT JOIN users u ON u.id = m.client_user_id
       WHERE m.project_id = ? OR (m.project_id IS NULL AND m.client_user_id = ?)
       ORDER BY m.start_date DESC`,
      [project.id, project.client_id]
    ),
    query(
      `SELECT *
       FROM project_milestones
       WHERE project_id = ?
       ORDER BY order_index ASC, created_at ASC`,
      [project.id]
    ),
    query(
      `SELECT r.*, u.username AS created_by_name
       FROM meeting_reports r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.project_id = ?
       ORDER BY r.created_at DESC`,
      [project.id]
    ),
    query(
      `SELECT d.*, u.username AS created_by_name
       FROM project_deliverables d
       LEFT JOIN users u ON u.id = d.created_by
       WHERE d.project_id = ?
       ORDER BY d.created_at DESC`,
      [project.id]
    ),
    query(
      `SELECT a.*
       FROM meeting_report_attachments a
       INNER JOIN meeting_reports r ON r.id = a.report_id
       WHERE r.project_id = ?
       ORDER BY a.created_at DESC`,
      [project.id]
    )
  ]);

  const financial = await getProjectFinancialSummary(project.id);
  const completedMeetingRows = await query(
    `SELECT id FROM meetings WHERE project_id = ? AND status = 'COMPLETED' ORDER BY updated_at ASC LIMIT 1`,
    [project.id]
  );
  const hasCompletedKickoffMeeting = completedMeetingRows.length > 0;
  const canAccessLockedDeliverables = user.role !== 'CLIENT' || financial.paidPercent >= 100;

  const reports = reportsRows.map((report) => ({
    ...mapMeetingReportRow(report),
    attachments: reportAttachmentsRows
      .filter((attachment) => attachment.report_id === report.id)
      .map((attachment) => ({
        id: attachment.id,
        reportId: attachment.report_id,
        fileUrl: attachment.file_url,
        fileName: attachment.file_name,
        createdAt: attachment.created_at
      }))
  }));

  const deliverables = deliverablesRows
    .map(mapDeliverableRow)
    .filter((item) => user.role !== 'CLIENT' || item.visibleToClient)
    .map((item) => ({
      ...item,
      downloadable: !item.locked || canAccessLockedDeliverables
    }));

  return {
    project: mapProjectSummaryRow(project),
    tasks: tasksRows.map(mapProjectTaskRow),
    meetings: meetingsRows.map(mapMeetingRow),
    milestones: milestonesRows.map(mapMilestoneRow),
    reports,
    deliverables,
    paymentProgress: financial,
    permissions: {
      canManageWorkflow: canManageProjectWorkflow(user, project),
      canManageTasks: canManageProjectTasks(user, project),
      canPayMilestones: user.role === 'CLIENT' && user.id === project.client_id && financial.kickoffPaid,
      canPayKickoff20: user.role === 'CLIENT' && user.id === project.client_id && financial.depositPaid && !financial.kickoffPaid && hasCompletedKickoffMeeting,
      canAccessLockedDeliverables
    }
  };
}

app.post('/api/projects/:id/pay-kickoff', auth, authorize('CLIENT'), async (req, res) => {
  const project = await findProjectById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (project.client_id !== req.user.id) return res.status(403).json({ message: 'Acces interdit.' });

  const financial = await getProjectFinancialSummary(project.id);
  if (!financial.depositPaid) {
    return res.status(400).json({ message: 'L\'acompte 10% doit etre paye avant le paiement kickoff 20%.' });
  }
  if (financial.kickoffPaid) {
    return res.status(400).json({ message: 'Le paiement kickoff 20% est deja effectue.' });
  }

  const kickoffMeetingRows = await query(
    `SELECT id FROM meetings WHERE project_id = ? AND status = 'COMPLETED' ORDER BY updated_at ASC LIMIT 1`,
    [project.id]
  );
  if (!kickoffMeetingRows.length) {
    return res.status(400).json({ message: 'Le paiement kickoff 20% est disponible apres validation du premier meeting.' });
  }

  if (!stripe) {
    return res.status(503).json({ message: 'Le paiement Stripe n\'est pas configure sur le serveur.' });
  }

  const kickoffAmount = Math.max(1, Math.round((financial.totalCents || 0) * 0.2));
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: `Kickoff 20% - ${project.service_name || project.service_type || 'Projet'}`,
          description: `Paiement 20% apres 1er meeting valide pour ${project.id.slice(0, 8)}`
        },
        unit_amount: kickoffAmount
      },
      quantity: 1
    }],
    metadata: {
      type: 'kickoff20',
      projectId: project.id,
      quoteId: project.id
    },
    success_url: `${FRONTEND_URL}/paiement/succes?session_id={CHECKOUT_SESSION_ID}&projectId=${project.id}`,
    cancel_url: `${FRONTEND_URL}/mes-projets/${project.id}`
  });

  await query(
    `INSERT INTO payments (
      id, quote_id, payment_type, stripe_session_id, amount_cents, currency, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [createId('pay'), project.id, 'KICKOFF20', session.id, kickoffAmount, 'EUR', 'PENDING', mysqlNow()]
  );

  return res.json({ checkoutUrl: session.url, sessionId: session.id });
});

app.get('/api/projects', auth, async (req, res) => {
  const { search = '', status = 'ALL', employeeId = 'ALL' } = req.query || {};

  const where = [];
  const params = [];

  if (req.user.role === 'CLIENT') {
    where.push('q.client_id = ?');
    params.push(req.user.id);
  } else if (req.user.role === 'EMPLOYE') {
    where.push('q.assigned_employee_id = ?');
    params.push(req.user.id);
  }

  if (String(status).trim() && String(status) !== 'ALL') {
    where.push('(q.statut = ? OR q.project_status = ?)');
    params.push(String(status).trim(), String(status).trim());
  }

  if (req.user.role === 'ADMIN' && String(employeeId).trim() && String(employeeId) !== 'ALL') {
    where.push('q.assigned_employee_id = ?');
    params.push(String(employeeId).trim());
  }

  if (String(search).trim()) {
    const searchToken = `%${String(search).trim()}%`;
    where.push('(q.id LIKE ? OR q.description LIKE ? OR q.service_type LIKE ? OR c.username LIKE ? OR s.name LIKE ?)');
    params.push(searchToken, searchToken, searchToken, searchToken, searchToken);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await query(
    `SELECT q.*, c.username AS client_username, e.username AS employee_username, s.name AS service_name,
            COUNT(t.id) AS tasks_total,
            SUM(CASE WHEN t.status = 'TO_DO' THEN 1 ELSE 0 END) AS tasks_todo,
            SUM(CASE WHEN t.status = 'DOING' THEN 1 ELSE 0 END) AS tasks_doing,
            SUM(CASE WHEN t.status = 'READY' THEN 1 ELSE 0 END) AS tasks_ready
     FROM quote_requests q
     LEFT JOIN users c ON c.id = q.client_id
     LEFT JOIN users e ON e.id = q.assigned_employee_id
     LEFT JOIN services s ON s.id = q.service_id
     LEFT JOIN project_tasks t ON t.project_id = q.id
     ${whereSql}
     GROUP BY q.id
     ORDER BY q.date_creation DESC`,
    params
  );

  return res.json({ projects: rows.map(mapProjectSummaryRow) });
});

app.get('/api/projects/:id/tasks', auth, async (req, res) => {
  const project = await findProjectById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (!canAccessProject(req.user, project)) return res.status(403).json({ message: 'Acces interdit.' });

  const tasksRows = await query(
    `SELECT t.*, u.username AS assigned_employee_name
     FROM project_tasks t
     LEFT JOIN users u ON u.id = t.assigned_employee_id
     WHERE t.project_id = ?
     ORDER BY FIELD(t.status, 'TO_DO', 'DOING', 'READY'), t.updated_at DESC`,
    [project.id]
  );

  const meetingsRows = await query(
    `SELECT id, title, start_date, end_date, status
     FROM meetings
     WHERE client_user_id = ?
     ORDER BY start_date DESC`,
    [project.client_id]
  );

  let assignees = [];
  if (req.user.role === 'ADMIN') {
    const employeesRows = await query(
      `SELECT id, username, email
       FROM users
       WHERE role = 'EMPLOYE' AND suspended = 0
       ORDER BY username ASC`
    );
    assignees = employeesRows.map((row) => ({ id: row.id, username: row.username, email: row.email }));
  } else if (req.user.role === 'EMPLOYE') {
    const me = await findUserById(req.user.id);
    assignees = me ? [{ id: me.id, username: me.username, email: me.email }] : [];
  }

  return res.json({
    project: mapProjectSummaryRow({
      ...project,
      tasks_total: tasksRows.length,
      tasks_todo: tasksRows.filter((task) => task.status === 'TO_DO').length,
      tasks_doing: tasksRows.filter((task) => task.status === 'DOING').length,
      tasks_ready: tasksRows.filter((task) => task.status === 'READY').length
    }),
    tasks: tasksRows.map(mapProjectTaskRow),
    assignees,
    meetings: meetingsRows.map((row) => ({
      id: row.id,
      title: row.title,
      start: row.start_date,
      end: row.end_date,
      status: row.status
    }))
  });
});

app.get('/api/projects/:id', auth, async (req, res) => {
  const project = await findProjectById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (!canAccessProject(req.user, project)) return res.status(403).json({ message: 'Acces interdit.' });

  const folder = await buildProjectFolderPayload(project, req.user);
  return res.json(folder);
});

app.post('/api/projects/:id/milestones', auth, authorize('ADMIN', 'EMPLOYE'), async (req, res) => {
  const project = await findProjectById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (!canManageProjectWorkflow(req.user, project)) return res.status(403).json({ message: 'Acces interdit.' });

  const { title, description, amountCents, percent, dueDate, totalMilestonesCount } = req.body || {};
  if (!title) {
    return res.status(400).json({ message: 'title est requis.' });
  }

  const quote = await findQuoteRequestById(project.id);
  const estimateAmount = Number(quote?.finalEstimation?.amount || 0);
  const existingMilestonesRows = await query('SELECT COUNT(*) AS total FROM project_milestones WHERE project_id = ?', [project.id]);
  const existingCount = Number(existingMilestonesRows[0]?.total || 0);
  const expectedMilestonesCount = Math.max(existingCount + 1, Number(totalMilestonesCount || existingCount + 1));
  const computedAmount = amountCents
    ? Number(amountCents)
    : (percent
      ? Math.round((estimateAmount * (Number(percent) || 0) / 100) * 100)
      : Math.round((estimateAmount * 0.7 * 100) / expectedMilestonesCount));

  if (!computedAmount || computedAmount <= 0) {
    return res.status(400).json({ message: 'Montant de milestone invalide.' });
  }

  const orderRows = await query('SELECT COALESCE(MAX(order_index), 0) AS max_order FROM project_milestones WHERE project_id = ?', [project.id]);
  const milestoneId = createId('mil');
  const now = mysqlNow();
  let normalizedDueDate = null;
  if (dueDate) {
    const parsedDueDate = parseDateInput(dueDate);
    if (!parsedDueDate) return res.status(400).json({ message: 'dueDate invalide.' });
    normalizedDueDate = parsedDueDate.toISOString().slice(0, 19).replace('T', ' ');
  }

  await query(
    `INSERT INTO project_milestones (
      id, project_id, title, description, amount_cents, percent, order_index, status, due_date,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      milestoneId,
      project.id,
      String(title).trim(),
      description ? String(description).trim() : '',
      Math.round(computedAmount),
      Number(percent || 0),
      Number(orderRows[0]?.max_order || 0) + 1,
      'CREATED',
      normalizedDueDate,
      req.user.id,
      now,
      now
    ]
  );

  await query(
    'UPDATE quote_requests SET project_status = ?, statut = CASE WHEN statut = ? THEN ? ELSE statut END WHERE id = ?',
    ['IN_PROGRESS', 'ACCEPTE', 'ACCEPTE', project.id]
  );

  const rows = await query('SELECT * FROM project_milestones WHERE id = ? LIMIT 1', [milestoneId]);
  return res.status(201).json({ milestone: mapMilestoneRow(rows[0]) });
});

app.put('/api/projects/:id/milestones/:milestoneId', auth, authorize('ADMIN', 'EMPLOYE'), async (req, res) => {
  const project = await findProjectById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (!canManageProjectWorkflow(req.user, project)) return res.status(403).json({ message: 'Acces interdit.' });

  const milestoneRows = await query(
    'SELECT * FROM project_milestones WHERE id = ? AND project_id = ? LIMIT 1',
    [req.params.milestoneId, project.id]
  );
  const milestone = milestoneRows[0];
  if (!milestone) return res.status(404).json({ message: 'Milestone introuvable.' });
  if (milestone.status === 'PAID') {
    return res.status(400).json({ message: 'Impossible de modifier un milestone deja paye.' });
  }

  const nextTitle = req.body?.title ? String(req.body.title).trim() : milestone.title;
  if (!nextTitle) return res.status(400).json({ message: 'title est requis.' });

  const nextDescription = req.body?.description !== undefined
    ? String(req.body.description || '').trim()
    : (milestone.description || '');

  const nextAmountCents = req.body?.amountCents !== undefined
    ? Number(req.body.amountCents)
    : Number(milestone.amount_cents || 0);
  if (!nextAmountCents || nextAmountCents <= 0) {
    return res.status(400).json({ message: 'Montant milestone invalide.' });
  }

  let nextDueDate = milestone.due_date || null;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'dueDate')) {
    if (!req.body.dueDate) {
      nextDueDate = null;
    } else {
      const parsedDueDate = parseDateInput(req.body.dueDate);
      if (!parsedDueDate) return res.status(400).json({ message: 'dueDate invalide.' });
      nextDueDate = parsedDueDate.toISOString().slice(0, 19).replace('T', ' ');
    }
  }

  await query(
    `UPDATE project_milestones
     SET title = ?, description = ?, amount_cents = ?, due_date = ?, updated_at = ?
     WHERE id = ? AND project_id = ?`,
    [nextTitle, nextDescription, Math.round(nextAmountCents), nextDueDate, mysqlNow(), milestone.id, project.id]
  );

  const updatedRows = await query('SELECT * FROM project_milestones WHERE id = ? LIMIT 1', [milestone.id]);
  return res.json({ milestone: mapMilestoneRow(updatedRows[0]) });
});

app.delete('/api/projects/:id/milestones/:milestoneId', auth, authorize('ADMIN', 'EMPLOYE'), async (req, res) => {
  const project = await findProjectById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (!canManageProjectWorkflow(req.user, project)) return res.status(403).json({ message: 'Acces interdit.' });

  const milestoneRows = await query(
    'SELECT * FROM project_milestones WHERE id = ? AND project_id = ? LIMIT 1',
    [req.params.milestoneId, project.id]
  );
  const milestone = milestoneRows[0];
  if (!milestone) return res.status(404).json({ message: 'Milestone introuvable.' });
  if (['PAID', 'PENDING'].includes(milestone.status)) {
    return res.status(400).json({ message: 'Impossible de supprimer un milestone deja paye ou en cours de paiement.' });
  }

  await query('UPDATE project_tasks SET milestone_id = NULL, updated_at = ? WHERE milestone_id = ?', [mysqlNow(), milestone.id]);
  await query('DELETE FROM project_milestones WHERE id = ? AND project_id = ?', [milestone.id, project.id]);

  return res.json({ success: true });
});

app.post('/api/projects/:id/milestones/:milestoneId/pay', auth, authorize('CLIENT'), async (req, res) => {
  const project = await findProjectById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (project.client_id !== req.user.id) return res.status(403).json({ message: 'Acces interdit.' });

  const milestoneRows = await query(
    'SELECT * FROM project_milestones WHERE id = ? AND project_id = ? LIMIT 1',
    [req.params.milestoneId, project.id]
  );
  const milestone = milestoneRows[0];
  if (!milestone) return res.status(404).json({ message: 'Milestone introuvable.' });
  if (milestone.status === 'PAID') return res.status(400).json({ message: 'Ce milestone est deja paye.' });
  if (milestone.status !== 'READY_FOR_PAYMENT') {
    return res.status(400).json({ message: 'Le milestone n\'est pas encore valide pour paiement.' });
  }

  const financial = await getProjectFinancialSummary(project.id);
  if (!financial.kickoffPaid) {
    return res.status(400).json({ message: 'Le paiement kickoff 20% doit etre effectue avant les paiements milestones.' });
  }
  if (!stripe) return res.status(503).json({ message: 'Le paiement Stripe n\'est pas configure sur le serveur.' });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: `Milestone - ${milestone.title}`,
          description: `Paiement milestone pour le projet ${project.id.slice(0, 8)}`
        },
        unit_amount: Number(milestone.amount_cents || 0)
      },
      quantity: 1
    }],
    metadata: {
      type: 'milestone',
      projectId: project.id,
      milestoneId: milestone.id,
      quoteId: project.id
    },
    success_url: `${FRONTEND_URL}/paiement/succes?session_id={CHECKOUT_SESSION_ID}&projectId=${project.id}`,
    cancel_url: `${FRONTEND_URL}/mes-projets/${project.id}`
  });

  await query(
    `INSERT INTO payments (
      id, quote_id, milestone_id, payment_type, stripe_session_id, amount_cents, currency, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [createId('pay'), project.id, milestone.id, 'MILESTONE', session.id, Number(milestone.amount_cents || 0), 'EUR', 'PENDING', mysqlNow()]
  );

  await query('UPDATE project_milestones SET status = ?, updated_at = ? WHERE id = ?', ['PENDING', mysqlNow(), milestone.id]);
  return res.json({ checkoutUrl: session.url, sessionId: session.id });
});

app.put('/api/projects/:id/milestones/:milestoneId/ready', auth, authorize('ADMIN', 'EMPLOYE'), async (req, res) => {
  const project = await findProjectById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (!canManageProjectWorkflow(req.user, project)) return res.status(403).json({ message: 'Acces interdit.' });

  const { validationMeetingId } = req.body || {};
  if (!validationMeetingId) {
    return res.status(400).json({ message: 'validationMeetingId est requis.' });
  }

  const milestoneRows = await query('SELECT * FROM project_milestones WHERE id = ? AND project_id = ? LIMIT 1', [req.params.milestoneId, project.id]);
  const milestone = milestoneRows[0];
  if (!milestone) return res.status(404).json({ message: 'Milestone introuvable.' });

  const meetingRows = await query('SELECT * FROM meetings WHERE id = ? AND project_id = ? LIMIT 1', [validationMeetingId, project.id]);
  const meeting = meetingRows[0];
  if (!meeting) return res.status(404).json({ message: 'Meeting de validation introuvable pour ce projet.' });
  if (meeting.status !== 'COMPLETED') {
    return res.status(400).json({ message: 'Le meeting de validation doit etre complete avant activation du paiement milestone.' });
  }

  await query(
    `UPDATE project_milestones
     SET status = 'READY_FOR_PAYMENT', validation_meeting_id = ?, updated_at = ?
     WHERE id = ? AND project_id = ?`,
    [meeting.id, mysqlNow(), milestone.id, project.id]
  );

  const updatedRows = await query('SELECT * FROM project_milestones WHERE id = ? LIMIT 1', [milestone.id]);
  return res.json({ milestone: mapMilestoneRow(updatedRows[0]) });
});

app.put('/api/meetings/:id/complete', auth, authorize('ADMIN', 'EMPLOYE'), async (req, res) => {
  const rows = await query('SELECT * FROM meetings WHERE id = ? LIMIT 1', [req.params.id]);
  const meeting = rows[0];
  if (!meeting) return res.status(404).json({ message: 'Meeting introuvable.' });

  const project = await resolveProjectFromMeeting(meeting, req.body?.projectId || null);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (!canManageProjectWorkflow(req.user, project)) return res.status(403).json({ message: 'Acces interdit.' });

  if (meeting.status === 'COMPLETED') {
    return res.json({ success: true, alreadyCompleted: true });
  }

  await query('UPDATE meetings SET status = ?, updated_at = ? WHERE id = ?', ['COMPLETED', mysqlNow(), meeting.id]);
  await query('UPDATE quote_requests SET project_status = ? WHERE id = ?', ['REVIEW', project.id]);

  return res.json({ success: true });
});

app.post('/api/meetings/:id/report', auth, authorize('ADMIN', 'EMPLOYE'), uploadFile.array('attachments', 10), async (req, res) => {
  const rows = await query('SELECT * FROM meetings WHERE id = ? LIMIT 1', [req.params.id]);
  const meeting = rows[0];
  if (!meeting) return res.status(404).json({ message: 'Meeting introuvable.' });

  const project = await resolveProjectFromMeeting(meeting, req.body?.projectId || null);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (!canManageProjectWorkflow(req.user, project)) return res.status(403).json({ message: 'Acces interdit.' });

  const { summary, decisions, blockers, actionItems, nextSteps } = req.body || {};
  if (!summary || !String(summary).trim()) {
    return res.status(400).json({ message: 'summary requis.' });
  }

  const reportId = createId('rpt');
  const now = mysqlNow();
  await query(
    `INSERT INTO meeting_reports (
      id, meeting_id, project_id, summary, decisions_json, blockers_json, action_items_json, next_steps_json,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reportId,
      meeting.id,
      project.id,
      String(summary).trim(),
      JSON.stringify(normalizeStringList(decisions)),
      JSON.stringify(normalizeStringList(blockers)),
      JSON.stringify(normalizeStringList(actionItems)),
      JSON.stringify(normalizeStringList(nextSteps)),
      req.user.id,
      now,
      now
    ]
  );

  if ((req.files || []).length) {
    for (const file of req.files) {
      await query(
        `INSERT INTO meeting_report_attachments (id, report_id, file_url, file_name, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [createId('att'), reportId, toPublicUploadUrl(req, file.filename), file.originalname, mysqlNow()]
      );
    }
  }

  await query('UPDATE quote_requests SET project_status = ? WHERE id = ?', ['IN_PROGRESS', project.id]);

  const reportRows = await query(
    `SELECT r.*, u.username AS created_by_name
     FROM meeting_reports r
     LEFT JOIN users u ON u.id = r.created_by
     WHERE r.id = ? LIMIT 1`,
    [reportId]
  );
  return res.status(201).json({ report: mapMeetingReportRow(reportRows[0]) });
});

app.post('/api/meetings/:id/next', auth, authorize('ADMIN', 'EMPLOYE'), async (req, res) => {
  const rows = await query('SELECT * FROM meetings WHERE id = ? LIMIT 1', [req.params.id]);
  const previousMeeting = rows[0];
  if (!previousMeeting) return res.status(404).json({ message: 'Meeting source introuvable.' });

  const project = await resolveProjectFromMeeting(previousMeeting, req.body?.projectId || null);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (!canManageProjectWorkflow(req.user, project)) return res.status(403).json({ message: 'Acces interdit.' });

  const { title, description, start, end, timezone } = req.body || {};
  if (!title || !start || !end) {
    return res.status(400).json({ message: 'title, start et end sont requis.' });
  }

  const organizer = await findUserById(req.user.id);
  const client = await findUserById(project.client_id);
  if (!organizer?.email || !client?.email) return res.status(400).json({ message: 'Participants introuvables.' });

  const startDate = parseDateInput(start);
  const endDate = parseDateInput(end);
  if (!startDate || !endDate || endDate <= startDate) {
    return res.status(400).json({ message: 'Dates invalides.' });
  }

  const meetingId = createId('meet');
  const tz = timezone || 'Europe/Paris';
  const startSql = startDate.toISOString().slice(0, 19).replace('T', ' ');
  const endSql = endDate.toISOString().slice(0, 19).replace('T', ' ');

  await query(
    `INSERT INTO meetings (
      id, project_id, title, description, start_date, end_date, timezone, created_by, client_user_id,
      status, sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [meetingId, project.id, String(title).trim(), description ? String(description).trim() : '', startSql, endSql, tz, req.user.id, project.client_id, 'SCHEDULED', 'PENDING', mysqlNow(), mysqlNow()]
  );

  try {
    const attendeeEmails = [...new Set([organizer.email, client.email])];
    const { googleEventId, meetLink } = await createGoogleMeetingEvent({
      title: String(title).trim(),
      description: description ? String(description).trim() : '',
      startIso: startDate.toISOString(),
      endIso: endDate.toISOString(),
      timezone: tz,
      attendeeEmails,
      requestId: `${meetingId}_${Date.now()}`
    });

    await query('UPDATE meetings SET google_event_id = ?, meet_link = ?, sync_status = ?, updated_at = ? WHERE id = ?', [googleEventId, meetLink, 'SYNCED', mysqlNow(), meetingId]);
  } catch (error) {
    await query('UPDATE meetings SET sync_status = ?, last_sync_error = ?, updated_at = ? WHERE id = ?', ['FAILED', error.message || 'Erreur de synchronisation Google Calendar', mysqlNow(), meetingId]);
    return res.status(502).json({ message: error.message || 'Impossible de creer la reunion Google Meet.' });
  }

  const meetingRows = await query(
    `SELECT m.*, u.username AS client_name, u.email AS client_email
     FROM meetings m
     LEFT JOIN users u ON u.id = m.client_user_id
     WHERE m.id = ? LIMIT 1`,
    [meetingId]
  );
  return res.status(201).json({ event: mapMeetingRow(meetingRows[0]) });
});

app.post('/api/projects/:id/deliverables', auth, authorize('ADMIN', 'EMPLOYE'), uploadFile.single('file'), async (req, res) => {
  const project = await findProjectById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (!canManageProjectWorkflow(req.user, project)) return res.status(403).json({ message: 'Acces interdit.' });

  const { title, description, visibleToClient } = req.body || {};
  if (!title || !req.file) return res.status(400).json({ message: 'title et file sont requis.' });

  const financial = await getProjectFinancialSummary(project.id);
  const lockByDefault = financial.paidPercent < 100;

  const deliverableId = createId('dlv');
  await query(
    `INSERT INTO project_deliverables (
      id, project_id, title, description, file_url, file_name, locked, visible_to_client,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      deliverableId,
      project.id,
      String(title).trim(),
      description ? String(description).trim() : '',
      toPublicUploadUrl(req, req.file.filename),
      req.file.originalname,
      lockByDefault ? 1 : 0,
      typeof visibleToClient === 'string' ? (visibleToClient === 'true' ? 1 : 0) : 1,
      req.user.id,
      mysqlNow(),
      mysqlNow()
    ]
  );

  const rowsDeliverables = await query(
    `SELECT d.*, u.username AS created_by_name
     FROM project_deliverables d
     LEFT JOIN users u ON u.id = d.created_by
     WHERE d.id = ? LIMIT 1`,
    [deliverableId]
  );

  return res.status(201).json({ deliverable: mapDeliverableRow(rowsDeliverables[0]) });
});

app.get('/api/projects/:id/deliverables/:deliverableId/download', auth, async (req, res) => {
  const project = await findProjectById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (!canAccessProject(req.user, project)) return res.status(403).json({ message: 'Acces interdit.' });

  const rows = await query(
    'SELECT * FROM project_deliverables WHERE id = ? AND project_id = ? LIMIT 1',
    [req.params.deliverableId, project.id]
  );
  const deliverable = rows[0];
  if (!deliverable) return res.status(404).json({ message: 'Livrable introuvable.' });

  const financial = await getProjectFinancialSummary(project.id);
  const canDownload = !deliverable.locked || req.user.role !== 'CLIENT' || financial.paidPercent >= 100;
  if (!canDownload) {
    return res.status(403).json({ message: 'Paiement complet requis pour telecharger ce livrable.' });
  }

  return res.json({ url: deliverable.file_url, fileName: deliverable.file_name });
});

app.post('/api/tasks', auth, authorize('ADMIN', 'EMPLOYE'), async (req, res) => {
  const { projectId, title, description, status, assignedEmployeeId, meetingId, milestoneId, deadline } = req.body || {};

  if (!projectId || !title || !assignedEmployeeId) {
    return res.status(400).json({ message: 'projectId, title et assignedEmployeeId sont requis.' });
  }

  const normalizedStatus = status && ['TO_DO', 'DOING', 'READY'].includes(status) ? status : 'TO_DO';
  const project = await findProjectById(projectId);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (!canManageProjectTasks(req.user, project)) return res.status(403).json({ message: 'Acces interdit pour ce projet.' });

  const assignee = await findUserById(assignedEmployeeId);
  if (!assignee || assignee.role !== 'EMPLOYE' || assignee.suspended) {
    return res.status(400).json({ message: 'Employe assigne invalide.' });
  }

  if (req.user.role === 'EMPLOYE' && assignee.id !== req.user.id) {
    return res.status(403).json({ message: 'Vous ne pouvez assigner une tache qu\'a vous-meme.' });
  }

  let normalizedMeetingId = null;
  if (meetingId) {
    const meetingRows = await query('SELECT * FROM meetings WHERE id = ? LIMIT 1', [meetingId]);
    const meeting = meetingRows[0];
    if (!meeting) return res.status(404).json({ message: 'Meeting de reference introuvable.' });
    if (meeting.client_user_id !== project.client_id) {
      return res.status(400).json({ message: 'Le meeting doit appartenir au meme client que le projet.' });
    }
    normalizedMeetingId = meeting.id;
  }

  let normalizedMilestoneId = null;
  if (milestoneId) {
    const milestoneRows = await query('SELECT * FROM project_milestones WHERE id = ? AND project_id = ? LIMIT 1', [milestoneId, project.id]);
    if (!milestoneRows[0]) return res.status(404).json({ message: 'Milestone de reference introuvable.' });
    normalizedMilestoneId = milestoneId;
  }

  let normalizedDeadline = null;
  if (deadline) {
    const parsedDeadline = parseDateInput(deadline);
    if (!parsedDeadline) return res.status(400).json({ message: 'Deadline invalide.' });
    normalizedDeadline = parsedDeadline.toISOString().slice(0, 19).replace('T', ' ');
  }

  const taskId = createId('tsk');
  const now = mysqlNow();
  await query(
    `INSERT INTO project_tasks (
      id, project_id, title, description, status, assigned_employee_id, meeting_id, milestone_id, deadline, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      taskId,
      project.id,
      String(title).trim(),
      description ? String(description).trim() : '',
      normalizedStatus,
      assignee.id,
      normalizedMeetingId,
      normalizedMilestoneId,
      normalizedDeadline,
      req.user.id,
      now,
      now
    ]
  );

  const createdRows = await query(
    `SELECT t.*, u.username AS assigned_employee_name
     FROM project_tasks t
     LEFT JOIN users u ON u.id = t.assigned_employee_id
     WHERE t.id = ? LIMIT 1`,
    [taskId]
  );

  return res.status(201).json({ task: mapProjectTaskRow(createdRows[0]) });
});

app.put('/api/tasks/:id', auth, authorize('ADMIN', 'EMPLOYE'), async (req, res) => {
  const taskRows = await query('SELECT * FROM project_tasks WHERE id = ? LIMIT 1', [req.params.id]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ message: 'Tache introuvable.' });

  const project = await findProjectById(task.project_id);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (!canManageProjectTasks(req.user, project)) return res.status(403).json({ message: 'Acces interdit pour ce projet.' });

  const nextTitle = req.body?.title ? String(req.body.title).trim() : task.title;
  const nextDescription = req.body?.description !== undefined ? String(req.body.description || '').trim() : (task.description || '');
  const nextStatus = req.body?.status && ['TO_DO', 'DOING', 'READY'].includes(req.body.status) ? req.body.status : task.status;
  const nextAssigneeId = req.body?.assignedEmployeeId || task.assigned_employee_id;

  const assignee = await findUserById(nextAssigneeId);
  if (!assignee || assignee.role !== 'EMPLOYE' || assignee.suspended) {
    return res.status(400).json({ message: 'Employe assigne invalide.' });
  }
  if (req.user.role === 'EMPLOYE' && assignee.id !== req.user.id) {
    return res.status(403).json({ message: 'Vous ne pouvez assigner une tache qu\'a vous-meme.' });
  }

  let nextMeetingId = task.meeting_id || null;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'meetingId')) {
    if (!req.body.meetingId) {
      nextMeetingId = null;
    } else {
      const meetingRows = await query('SELECT * FROM meetings WHERE id = ? LIMIT 1', [req.body.meetingId]);
      const meeting = meetingRows[0];
      if (!meeting) return res.status(404).json({ message: 'Meeting de reference introuvable.' });
      if (meeting.client_user_id !== project.client_id) {
        return res.status(400).json({ message: 'Le meeting doit appartenir au meme client que le projet.' });
      }
      nextMeetingId = meeting.id;
    }
  }

  let nextMilestoneId = task.milestone_id || null;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'milestoneId')) {
    if (!req.body.milestoneId) {
      nextMilestoneId = null;
    } else {
      const milestoneRows = await query('SELECT * FROM project_milestones WHERE id = ? AND project_id = ? LIMIT 1', [req.body.milestoneId, project.id]);
      if (!milestoneRows[0]) return res.status(404).json({ message: 'Milestone de reference introuvable.' });
      nextMilestoneId = req.body.milestoneId;
    }
  }

  let nextDeadline = task.deadline || null;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'deadline')) {
    if (!req.body.deadline) {
      nextDeadline = null;
    } else {
      const parsedDeadline = parseDateInput(req.body.deadline);
      if (!parsedDeadline) return res.status(400).json({ message: 'Deadline invalide.' });
      nextDeadline = parsedDeadline.toISOString().slice(0, 19).replace('T', ' ');
    }
  }

  await query(
    `UPDATE project_tasks
     SET title = ?, description = ?, status = ?, assigned_employee_id = ?, meeting_id = ?, milestone_id = ?, deadline = ?, updated_at = ?
     WHERE id = ?`,
    [nextTitle, nextDescription, nextStatus, assignee.id, nextMeetingId, nextMilestoneId, nextDeadline, mysqlNow(), task.id]
  );

  const updatedRows = await query(
    `SELECT t.*, u.username AS assigned_employee_name
     FROM project_tasks t
     LEFT JOIN users u ON u.id = t.assigned_employee_id
     WHERE t.id = ? LIMIT 1`,
    [task.id]
  );

  return res.json({ task: mapProjectTaskRow(updatedRows[0]) });
});

app.delete('/api/tasks/:id', auth, authorize('ADMIN', 'EMPLOYE'), async (req, res) => {
  const taskRows = await query('SELECT * FROM project_tasks WHERE id = ? LIMIT 1', [req.params.id]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ message: 'Tache introuvable.' });

  const project = await findProjectById(task.project_id);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (!canManageProjectTasks(req.user, project)) return res.status(403).json({ message: 'Acces interdit pour ce projet.' });

  await query('DELETE FROM project_tasks WHERE id = ?', [task.id]);
  return res.json({ success: true });
});

app.put('/api/tasks/:id/status', auth, authorize('ADMIN', 'EMPLOYE'), async (req, res) => {
  const { status } = req.body || {};
  if (!['TO_DO', 'DOING', 'READY'].includes(status)) {
    return res.status(400).json({ message: 'status doit etre TO_DO, DOING ou READY.' });
  }

  const taskRows = await query('SELECT * FROM project_tasks WHERE id = ? LIMIT 1', [req.params.id]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ message: 'Tache introuvable.' });

  const project = await findProjectById(task.project_id);
  if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
  if (!canManageProjectTasks(req.user, project)) return res.status(403).json({ message: 'Acces interdit pour ce projet.' });

  await query('UPDATE project_tasks SET status = ?, updated_at = ? WHERE id = ?', [status, mysqlNow(), task.id]);

  const updatedRows = await query(
    `SELECT t.*, u.username AS assigned_employee_name
     FROM project_tasks t
     LEFT JOIN users u ON u.id = t.assigned_employee_id
     WHERE t.id = ? LIMIT 1`,
    [task.id]
  );
  return res.json({ task: mapProjectTaskRow(updatedRows[0]) });
});

app.get('/api/events/paid-projects', auth, authorize('ADMIN', 'EMPLOYE'), async (req, res) => {
  let rows;
  if (req.user.role === 'EMPLOYE') {
    rows = await query(
      `SELECT q.id, q.service_type, q.deposit_paid, q.client_id,
              c.username AS client_name, c.email AS client_email, s.name AS service_name
       FROM quote_requests q
       LEFT JOIN users c ON c.id = q.client_id
       LEFT JOIN services s ON s.id = q.service_id
       WHERE q.assigned_employee_id = ? AND q.deposit_paid = 1
       ORDER BY q.date_creation DESC`,
      [req.user.id]
    );
  } else {
    rows = await query(
      `SELECT q.id, q.service_type, q.deposit_paid, q.client_id,
              c.username AS client_name, c.email AS client_email, s.name AS service_name
       FROM quote_requests q
       LEFT JOIN users c ON c.id = q.client_id
       LEFT JOIN services s ON s.id = q.service_id
       WHERE q.deposit_paid = 1
       ORDER BY q.date_creation DESC`
    );
  }

  return res.json({
    projects: rows.map((row) => ({
      id: row.id,
      name: row.service_name || row.service_type || 'Projet',
      clientId: row.client_id,
      clientName: row.client_name || null,
      clientEmail: row.client_email || null
    }))
  });
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
  const { title, description, start, end, timezone, clientUserId, projectId } = req.body || {};
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

  let normalizedProjectId = null;
  if (projectId) {
    const project = await findProjectById(projectId);
    if (!project) return res.status(404).json({ message: 'Projet introuvable.' });
    if (!canManageProjectWorkflow(req.user, project)) return res.status(403).json({ message: 'Acces interdit pour ce projet.' });
    if (project.client_id !== client.id) {
      return res.status(400).json({ message: 'Le client du meeting ne correspond pas au client du projet.' });
    }
    normalizedProjectId = project.id;
  }

  await query(
    `INSERT INTO meetings (
      id, project_id, title, description, start_date, end_date, timezone, created_by, client_user_id,
      status, sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [eventId, normalizedProjectId, String(title).trim(), description ? String(description).trim() : '', startSql, endSql, tz, req.user.id, client.id, 'SCHEDULED', 'PENDING', mysqlNow(), mysqlNow()]
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
  if (event.status === 'COMPLETED') return res.status(400).json({ message: 'Evenement deja termine.' });

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
  if (event.status === 'COMPLETED') return res.status(400).json({ message: 'Impossible d\'annuler un meeting termine.' });

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
  await ensureColumnIfMissing('quote_requests', 'kickoff_paid', 'TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumnIfMissing('quote_requests', 'project_status', "VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED'");
  await ensureColumnIfMissing('quote_requests', 'project_completion_percent', 'INT NOT NULL DEFAULT 0');

  await query(`
    CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(64) PRIMARY KEY,
      quote_id VARCHAR(64) NOT NULL,
      milestone_id VARCHAR(64) NULL,
      payment_type VARCHAR(20) NOT NULL DEFAULT 'DEPOSIT',
      stripe_session_id VARCHAR(255) NULL,
      amount_cents INT NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      created_at DATETIME NOT NULL,
      INDEX idx_pay_quote (quote_id),
      INDEX idx_pay_milestone (milestone_id),
      INDEX idx_pay_session (stripe_session_id)
    )
  `);
  await ensureColumnIfMissing('payments', 'milestone_id', 'VARCHAR(64) NULL');
  await ensureColumnIfMissing('payments', 'payment_type', "VARCHAR(20) NOT NULL DEFAULT 'DEPOSIT'");

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
      project_id VARCHAR(64) NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      start_date DATETIME NOT NULL,
      end_date DATETIME NOT NULL,
      timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Paris',
      created_by VARCHAR(64) NOT NULL,
      client_user_id VARCHAR(64) NOT NULL,
      google_event_id VARCHAR(255) NULL,
      meet_link TEXT NULL,
      status ENUM('SCHEDULED', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'SCHEDULED',
      sync_status ENUM('PENDING', 'SYNCED', 'FAILED') NOT NULL DEFAULT 'PENDING',
      last_sync_error TEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_meetings_project (project_id),
      INDEX idx_meetings_start (start_date),
      INDEX idx_meetings_client (client_user_id),
      INDEX idx_meetings_creator (created_by),
      UNIQUE KEY uq_meetings_google_event (google_event_id)
    )
  `);
  await ensureColumnIfMissing('meetings', 'project_id', 'VARCHAR(64) NULL');
  await query(
    "ALTER TABLE meetings MODIFY COLUMN status ENUM('SCHEDULED', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'SCHEDULED'"
  ).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS project_milestones (
      id VARCHAR(64) PRIMARY KEY,
      project_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      amount_cents INT NOT NULL,
      percent DECIMAL(6,2) NOT NULL DEFAULT 0,
      order_index INT NOT NULL DEFAULT 1,
      status ENUM('CREATED', 'READY_FOR_PAYMENT', 'PENDING', 'PAID', 'FAILED') NOT NULL DEFAULT 'CREATED',
      validation_meeting_id VARCHAR(64) NULL,
      due_date DATETIME NULL,
      paid_at DATETIME NULL,
      payment_id VARCHAR(255) NULL,
      created_by VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_milestones_project (project_id),
      INDEX idx_milestones_status (status),
      INDEX idx_milestones_validation_meeting (validation_meeting_id)
    )
  `);
  await ensureColumnIfMissing('project_milestones', 'validation_meeting_id', 'VARCHAR(64) NULL');
  await query(
    "ALTER TABLE project_milestones MODIFY COLUMN status ENUM('CREATED', 'READY_FOR_PAYMENT', 'PENDING', 'PAID', 'FAILED') NOT NULL DEFAULT 'CREATED'"
  ).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS meeting_reports (
      id VARCHAR(64) PRIMARY KEY,
      meeting_id VARCHAR(64) NOT NULL,
      project_id VARCHAR(64) NOT NULL,
      summary TEXT NOT NULL,
      decisions_json LONGTEXT NULL,
      blockers_json LONGTEXT NULL,
      action_items_json LONGTEXT NULL,
      next_steps_json LONGTEXT NULL,
      created_by VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_reports_project (project_id),
      INDEX idx_reports_meeting (meeting_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS meeting_report_attachments (
      id VARCHAR(64) PRIMARY KEY,
      report_id VARCHAR(64) NOT NULL,
      file_url VARCHAR(500) NOT NULL,
      file_name VARCHAR(255) NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_report_attachments_report (report_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS project_deliverables (
      id VARCHAR(64) PRIMARY KEY,
      project_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      file_url VARCHAR(500) NOT NULL,
      file_name VARCHAR(255) NULL,
      locked TINYINT(1) NOT NULL DEFAULT 1,
      visible_to_client TINYINT(1) NOT NULL DEFAULT 1,
      created_by VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_deliverables_project (project_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS project_tasks (
      id VARCHAR(64) PRIMARY KEY,
      project_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      status ENUM('TO_DO', 'DOING', 'READY') NOT NULL DEFAULT 'TO_DO',
      assigned_employee_id VARCHAR(64) NOT NULL,
      meeting_id VARCHAR(64) NULL,
      milestone_id VARCHAR(64) NULL,
      deadline DATETIME NULL,
      created_by VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_tasks_project (project_id),
      INDEX idx_tasks_status (status),
      INDEX idx_tasks_assignee (assigned_employee_id),
      INDEX idx_tasks_meeting (meeting_id),
      INDEX idx_tasks_milestone (milestone_id)
    )
  `);
  await ensureColumnIfMissing('project_tasks', 'milestone_id', 'VARCHAR(64) NULL');

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