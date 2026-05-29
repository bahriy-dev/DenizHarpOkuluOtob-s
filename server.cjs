const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const sessions = new Map();

const statusOrder = ['backlog', 'todo', 'doing', 'review', 'done'];
const priorities = ['low', 'medium', 'high', 'urgent'];
const noteTones = ['focus', 'release', 'risk', 'meeting'];
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
};

// ─── Database helpers ────────────────────────────────────────────────────────

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const now = new Date().toISOString();
    fs.writeFileSync(
      DB_PATH,
      JSON.stringify({ users: [], projects: [], tasks: [], calendarNotes: [], createdAt: now }, null, 2),
      'utf8'
    );
  }
}

function readDb() {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  db.users ||= [];
  db.projects ||= [];
  db.tasks ||= [];
  db.calendarNotes ||= [];
  return db;
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((item) => item.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('İstek çok büyük.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Geçersiz JSON.'));
      }
    });
    req.on('error', reject);
  });
}

// ─── Auth helpers ────────────────────────────────────────────────────────────

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  try {
    const [salt, expected] = storedHash.split(':');
    const actual = hashPassword(password, salt).split(':')[1];
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function currentUser(req, db) {
  const sid = parseCookies(req).sid;
  const session = sid && sessions.get(sid);
  if (!session || session.expiresAt < Date.now()) return null;
  const user = db.users.find((item) => item.id === session.userId);
  return user ? sanitizeUser(user) : null;
}

function sanitizeUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function requireUser(req, res, db) {
  const user = currentUser(req, db);
  if (!user) json(res, 401, { error: 'Oturum açmanız gerekiyor.' });
  return user;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function userOwnsProject(db, userId, projectId) {
  return db.projects.some((project) => project.id === projectId && project.ownerId === userId);
}

function createSession(res, userId) {
  const sid = crypto.randomBytes(24).toString('hex');
  sessions.set(sid, { userId, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
}

// ─── Seed data ───────────────────────────────────────────────────────────────

function seedFirstProject(db, user) {
  const now = new Date().toISOString();
  const project = {
    id: makeId('prj'),
    ownerId: user.id,
    name: 'İlk Yazılım Projem',
    key: 'IYP',
    description: 'Sprint, görev ve yayın akışlarını tek panoda takip et.',
    createdAt: now,
    updatedAt: now,
  };
  const tasks = [
    ['Üyelik akışını test et', 'todo', 'high'],
    ['Dashboard metriklerini bağla', 'doing', 'medium'],
    ['İlk sürüm notlarını hazırla', 'backlog', 'low'],
  ].map(([title, status, priority], index) => ({
    id: makeId('tsk'),
    projectId: project.id,
    ownerId: user.id,
    title,
    description: '',
    status,
    priority,
    assignee: index === 0 ? user.name : '',
    dueDate: '',
    createdAt: now,
    updatedAt: now,
  }));
  const notes = [
    ['Sprint planlama', 'meeting', 1],
    ['Yayın adayını dondur', 'release', 5],
  ].map(([title, tone, offset]) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return {
      id: makeId('note'),
      projectId: project.id,
      ownerId: user.id,
      date: date.toISOString().slice(0, 10),
      title,
      body: '',
      tone,
      createdAt: now,
      updatedAt: now,
    };
  });
  db.projects.push(project);
  db.tasks.push(...tasks);
  db.calendarNotes.push(...notes);
}

// ─── API handler ─────────────────────────────────────────────────────────────

async function handleApi(req, res) {
  const db = readDb();
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    // ── Auth routes (no session required) ──────────────────────────────────

    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      const body = await readBody(req);
      const name = normalizeText(body.name);
      const email = normalizeText(body.email).toLowerCase();
      const password = String(body.password || '');

      if (name.length < 2) return json(res, 400, { error: 'Ad en az 2 karakter olmalı.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json(res, 400, { error: 'Geçerli bir e-posta girin.' });
      }
      if (password.length < 8) return json(res, 400, { error: 'Parola en az 8 karakter olmalı.' });
      if (db.users.some((user) => user.email === email)) {
        return json(res, 409, { error: 'Bu e-posta zaten kayıtlı.' });
      }

      const now = new Date().toISOString();
      const user = { id: makeId('usr'), name, email, passwordHash: hashPassword(password), createdAt: now };
      db.users.push(user);
      seedFirstProject(db, user);
      writeDb(db);
      createSession(res, user.id);
      return json(res, 201, { user: sanitizeUser(user) });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readBody(req);
      const email = normalizeText(body.email).toLowerCase();
      const password = String(body.password || '');
      const user = db.users.find((item) => item.email === email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return json(res, 401, { error: 'E-posta veya parola hatalı.' });
      }
      createSession(res, user.id);
      return json(res, 200, { user: sanitizeUser(user) });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      const sid = parseCookies(req).sid;
      if (sid) sessions.delete(sid);
      res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/me') {
      return json(res, 200, { user: currentUser(req, db) });
    }

    // ── Authenticated routes ───────────────────────────────────────────────

    const user = requireUser(req, res, db);
    if (!user) return;

    // Projects
    if (req.method === 'GET' && url.pathname === '/api/projects') {
      const projects = db.projects.filter((project) => project.ownerId === user.id);
      // Attach task counts for each project
      const projectsWithCounts = projects.map((project) => ({
        ...project,
        taskCount: db.tasks.filter((task) => task.projectId === project.id && task.ownerId === user.id).length,
      }));
      return json(res, 200, { projects: projectsWithCounts });
    }

    if (req.method === 'POST' && url.pathname === '/api/projects') {
      const body = await readBody(req);
      const name = normalizeText(body.name);
      if (name.length < 2) return json(res, 400, { error: 'Proje adı en az 2 karakter olmalı.' });
      const rawKey = normalizeText(body.key).slice(0, 6).toUpperCase();
      const key = rawKey.length >= 2 ? rawKey : name.slice(0, 3).toUpperCase().replace(/\s/g, '');
      const now = new Date().toISOString();
      const project = {
        id: makeId('prj'),
        ownerId: user.id,
        name,
        key: key || 'PRJ',
        description: normalizeText(body.description),
        createdAt: now,
        updatedAt: now,
      };
      db.projects.push(project);
      writeDb(db);
      return json(res, 201, { project: { ...project, taskCount: 0 } });
    }

    const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);

    if (projectMatch && req.method === 'PATCH') {
      const projectId = projectMatch[1];
      const project = db.projects.find((item) => item.id === projectId && item.ownerId === user.id);
      if (!project) return json(res, 404, { error: 'Proje bulunamadı.' });
      const body = await readBody(req);
      const allowed = ['name', 'key', 'description'];
      for (const key of allowed) {
        if (body[key] === undefined) continue;
        if (key === 'name' && normalizeText(body.name).length < 2) continue;
        project[key] = normalizeText(body[key]);
      }
      project.updatedAt = new Date().toISOString();
      writeDb(db);
      return json(res, 200, { project });
    }

    if (projectMatch && req.method === 'DELETE') {
      const projectId = projectMatch[1];
      const project = db.projects.find((item) => item.id === projectId && item.ownerId === user.id);
      if (!project) return json(res, 404, { error: 'Proje bulunamadı.' });
      db.projects = db.projects.filter((item) => item.id !== projectId);
      db.tasks = db.tasks.filter((item) => !(item.projectId === projectId && item.ownerId === user.id));
      db.calendarNotes = db.calendarNotes.filter((item) => !(item.projectId === projectId && item.ownerId === user.id));
      writeDb(db);
      return json(res, 200, { ok: true });
    }

    // Tasks
    if (req.method === 'GET' && url.pathname === '/api/tasks') {
      const projectId = url.searchParams.get('projectId');
      const tasks = db.tasks.filter((task) => {
        if (task.ownerId !== user.id) return false;
        if (projectId && task.projectId !== projectId) return false;
        return true;
      });
      return json(res, 200, { tasks });
    }

    if (req.method === 'POST' && url.pathname === '/api/tasks') {
      const body = await readBody(req);
      const title = normalizeText(body.title);
      const projectId = normalizeText(body.projectId);
      if (!userOwnsProject(db, user.id, projectId)) return json(res, 404, { error: 'Proje bulunamadı.' });
      if (title.length < 3) return json(res, 400, { error: 'Görev başlığı en az 3 karakter olmalı.' });
      const now = new Date().toISOString();
      const task = {
        id: makeId('tsk'),
        projectId,
        ownerId: user.id,
        title,
        description: normalizeText(body.description),
        status: statusOrder.includes(body.status) ? body.status : 'backlog',
        priority: priorities.includes(body.priority) ? body.priority : 'medium',
        assignee: normalizeText(body.assignee),
        dueDate: normalizeText(body.dueDate),
        createdAt: now,
        updatedAt: now,
      };
      db.tasks.push(task);
      writeDb(db);
      return json(res, 201, { task });
    }

    const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);

    if (taskMatch && req.method === 'PATCH') {
      const body = await readBody(req);
      const task = db.tasks.find((item) => item.id === taskMatch[1] && item.ownerId === user.id);
      if (!task) return json(res, 404, { error: 'Görev bulunamadı.' });
      const allowed = ['title', 'description', 'status', 'priority', 'assignee', 'dueDate'];
      for (const key of allowed) {
        if (body[key] === undefined) continue;
        if (key === 'status' && !statusOrder.includes(body[key])) continue;
        if (key === 'priority' && !priorities.includes(body[key])) continue;
        // Validate title length when updating
        if (key === 'title' && normalizeText(body[key]).length < 3) {
          return json(res, 400, { error: 'Görev başlığı en az 3 karakter olmalı.' });
        }
        task[key] = typeof body[key] === 'string' ? normalizeText(body[key]) : body[key];
      }
      task.updatedAt = new Date().toISOString();
      writeDb(db);
      return json(res, 200, { task });
    }

    if (taskMatch && req.method === 'DELETE') {
      const before = db.tasks.length;
      db.tasks = db.tasks.filter((item) => !(item.id === taskMatch[1] && item.ownerId === user.id));
      if (db.tasks.length === before) return json(res, 404, { error: 'Görev bulunamadı.' });
      writeDb(db);
      return json(res, 200, { ok: true });
    }

    // Calendar Notes
    if (req.method === 'GET' && url.pathname === '/api/calendar-notes') {
      const projectId = url.searchParams.get('projectId');
      const notes = db.calendarNotes.filter((note) => {
        if (note.ownerId !== user.id) return false;
        if (projectId && note.projectId !== projectId) return false;
        return true;
      });
      return json(res, 200, { notes });
    }

    if (req.method === 'POST' && url.pathname === '/api/calendar-notes') {
      const body = await readBody(req);
      const projectId = normalizeText(body.projectId);
      const date = normalizeText(body.date);
      const title = normalizeText(body.title);
      if (!userOwnsProject(db, user.id, projectId)) return json(res, 404, { error: 'Proje bulunamadı.' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'Geçerli bir tarih seçin.' });
      if (title.length < 2) return json(res, 400, { error: 'Not başlığı en az 2 karakter olmalı.' });
      const now = new Date().toISOString();
      const note = {
        id: makeId('note'),
        projectId,
        ownerId: user.id,
        date,
        title,
        body: normalizeText(body.body),
        tone: noteTones.includes(body.tone) ? body.tone : 'focus',
        createdAt: now,
        updatedAt: now,
      };
      db.calendarNotes.push(note);
      writeDb(db);
      return json(res, 201, { note });
    }

    const noteMatch = url.pathname.match(/^\/api\/calendar-notes\/([^/]+)$/);

    if (noteMatch && req.method === 'PATCH') {
      const body = await readBody(req);
      const note = db.calendarNotes.find((item) => item.id === noteMatch[1] && item.ownerId === user.id);
      if (!note) return json(res, 404, { error: 'Takvim notu bulunamadı.' });
      const allowed = ['title', 'body', 'tone', 'date'];
      for (const key of allowed) {
        if (body[key] === undefined) continue;
        if (key === 'tone' && !noteTones.includes(body[key])) continue;
        if (key === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(body[key])) continue;
        if (key === 'title' && normalizeText(body[key]).length < 2) {
          return json(res, 400, { error: 'Not başlığı en az 2 karakter olmalı.' });
        }
        note[key] = typeof body[key] === 'string' ? normalizeText(body[key]) : body[key];
      }
      note.updatedAt = new Date().toISOString();
      writeDb(db);
      return json(res, 200, { note });
    }

    if (noteMatch && req.method === 'DELETE') {
      const before = db.calendarNotes.length;
      db.calendarNotes = db.calendarNotes.filter((note) => !(note.id === noteMatch[1] && note.ownerId === user.id));
      if (db.calendarNotes.length === before) return json(res, 404, { error: 'Takvim notu bulunamadı.' });
      writeDb(db);
      return json(res, 200, { ok: true });
    }

    json(res, 404, { error: 'API yolu bulunamadı.' });
  } catch (error) {
    console.error('[API Error]', error);
    json(res, 400, { error: error.message || 'İstek işlenemedi.' });
  }
}

// ─── Static file server ──────────────────────────────────────────────────────

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Erişim reddedildi');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Sayfa bulunamadı');
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handleApi(req, res);
  serveStatic(req, res);
});

ensureDb();
server.listen(PORT, () => {
  console.log(`\n  🚀 ProjectFlow  →  http://localhost:${PORT}\n`);
});
