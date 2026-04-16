const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const mysql = require('mysql2/promise');
const { parse } = require('csv-parse/sync');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'ulysse-media-secret-dev';
const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'root';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'UlysseMediaDB';

let db;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function query(sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows;
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
  return res.json({ user: sanitizeUser(nextUser) });
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

app.post('/api/quote-requests', auth, authorize('CLIENT'), async (req, res) => {
  const { description, paletteCouleur, inspiration, contraintes, serviceType } = req.body;
  if (!description) {
    return res.status(400).json({ message: 'description requise.' });
  }

  const quoteRequest = {
    id: createId('dmd'),
    clientId: req.user.id,
    description,
    paletteCouleur: paletteCouleur || '',
    inspiration: inspiration || '',
    contraintes: contraintes || '',
    serviceType: serviceType || 'DESIGN',
    statut: 'EN_ATTENTE',
    dateCreation: mysqlNow()
  };

  await query(
    `INSERT INTO quote_requests (
      id, client_id, description, palette_couleur, inspiration, contraintes,
      service_type, statut, date_creation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      quoteRequest.id,
      quoteRequest.clientId,
      quoteRequest.description,
      quoteRequest.paletteCouleur,
      quoteRequest.inspiration,
      quoteRequest.contraintes,
      quoteRequest.serviceType,
      quoteRequest.statut,
      quoteRequest.dateCreation
    ]
  );
  return res.status(201).json({ quoteRequest });
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
    rows = await query('SELECT * FROM quote_requests WHERE client_id = ? ORDER BY date_creation DESC', [req.user.id]);
  } else {
    rows = await query('SELECT * FROM quote_requests ORDER BY date_creation DESC');
  }
  const quoteRequests = rows.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    description: row.description,
    paletteCouleur: row.palette_couleur,
    inspiration: row.inspiration,
    contraintes: row.contraintes,
    serviceType: row.service_type,
    statut: row.statut,
    dateCreation: row.date_creation
  }));
  return res.json({ quoteRequests });
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

app.get('/api/calendar/events', auth, async (req, res) => {
  const rows = await query('SELECT * FROM calendar_events ORDER BY start_date ASC');
  const events = rows.map((row) => ({
    id: row.id,
    title: row.title,
    start: row.start_date,
    end: row.end_date,
    createdBy: row.created_by
  }));
  return res.json({ events });
});

app.post('/api/calendar/events', auth, async (req, res) => {
  const { title, start, end } = req.body;
  if (!title || !start || !end) {
    return res.status(400).json({ message: 'title, start, end requis.' });
  }
  const event = {
    id: createId('evt'),
    title,
    start,
    end,
    createdBy: req.user.id
  };
  await query(
    `INSERT INTO calendar_events (id, title, start_date, end_date, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [event.id, event.title, event.start, event.end, event.createdBy]
  );
  return res.status(201).json({ event });
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
      description TEXT NOT NULL,
      palette_couleur VARCHAR(255) NULL,
      inspiration TEXT NULL,
      contraintes TEXT NULL,
      service_type VARCHAR(60) NOT NULL,
      statut VARCHAR(60) NOT NULL,
      date_creation DATETIME NOT NULL,
      INDEX idx_quote_client (client_id)
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
}

bootstrapMySql()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API Ulysse Media + MySQL (${MYSQL_DATABASE}) démarrée sur le port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Erreur de démarrage MySQL:', error.message);
    process.exit(1);
  });