/**
 * 네이버 증권 API Express 서버 + 인증 + 게시판
 * - /api/quote/:codes  →  네이버 주식 현재가 조회
 * - /api/health        →  서버 헬스체크
 * - /api/auth/register →  회원가입
 * - /api/auth/login    →  로그인
 * - /api/auth/me       →  내 정보
 * - /api/posts         →  게시글 목록/작성
 * - /api/posts/:id     →  게시글 상세/수정/삭제
 */

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getStockPrices } from './naver-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const isProd = process.env.NODE_ENV === 'production';
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');

// ============== 데이터 저장소 ==============

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============== 관리자 시드 ==============
function seedAdmin() {
  ensureDataDir();
  const users = loadJSON(USERS_FILE);
  if (users.find(u => u.username === 'ysk')) return;

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync('admin', salt, 10000, 64, 'sha512').toString('hex');
  users.push({
    id: crypto.randomUUID(),
    username: 'ysk',
    nickname: '관리자',
    salt,
    hash,
    createdAt: Date.now(),
  });
  saveJSON(USERS_FILE, users);
  console.log('[Seed] 관리자 계정 생성됨 (ysk / admin)');
}

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return []; }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

// ============== 인증 미들웨어 ==============

const TOKENS = new Map(); // token → { userId, expiredAt }

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });
  const session = TOKENS.get(token);
  if (!session || session.expiredAt < Date.now()) {
    TOKENS.delete(token);
    return res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해주세요.' });
  }
  req.userId = session.userId;
  req.token = token;
  next();
}

// ============== 인증 API ==============

app.post('/api/auth/register', (req, res) => {
  const { username, password, nickname } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요.' });
  }
  if (username.length < 3) return res.status(400).json({ error: '아이디는 3자 이상이어야 합니다.' });
  if (password.length < 4) return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });

  ensureDataDir();
  const users = loadJSON(USERS_FILE);

  if (users.find(u => u.username === username)) {
    return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');

  const user = {
    id: crypto.randomUUID(),
    username,
    nickname: nickname || username,
    salt,
    hash,
    createdAt: Date.now(),
  };
  users.push(user);
  saveJSON(USERS_FILE, users);

  res.status(201).json({ message: '회원가입 성공!', userId: user.id });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요.' });
  }

  const users = loadJSON(USERS_FILE);
  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: '아이디 또는 비밀번호가 일치하지 않습니다.' });

  const hash = crypto.pbkdf2Sync(password, user.salt, 10000, 64, 'sha512').toString('hex');
  if (hash !== user.hash) return res.status(401).json({ error: '아이디 또는 비밀번호가 일치하지 않습니다.' });

  const token = generateToken();
  TOKENS.set(token, { userId: user.id, expiredAt: Date.now() + 24 * 60 * 60 * 1000 }); // 24시간

  res.json({
    token,
    user: { id: user.id, username: user.username, nickname: user.nickname, createdAt: user.createdAt },
  });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const users = loadJSON(USERS_FILE);
  const user = users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  res.json({ id: user.id, username: user.username, nickname: user.nickname, createdAt: user.createdAt });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  TOKENS.delete(req.token);
  res.json({ message: '로그아웃되었습니다.' });
});

// ============== 게시판 API ==============

// 게시글 목록
app.get('/api/posts', (req, res) => {
  ensureDataDir();
  const posts = loadJSON(POSTS_FILE);
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const start = (page - 1) * limit;

  // 사용자 닉네임 매핑
  const users = loadJSON(USERS_FILE);
  const userMap = {};
  users.forEach(u => { userMap[u.id] = u.nickname; });

  const sorted = [...posts].sort((a, b) => b.createdAt - a.createdAt);
  const paged = sorted.slice(start, start + limit);

  res.json({
    posts: paged.map(p => ({
      id: p.id,
      title: p.title,
      author: userMap[p.userId] || '익명',
      createdAt: p.createdAt,
      viewCount: p.viewCount,
      commentCount: (p.comments || []).length,
    })),
    total: posts.length,
    page,
    totalPages: Math.ceil(posts.length / limit),
  });
});

// 게시글 작성
app.post('/api/posts', requireAuth, (req, res) => {
  const { title, content } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: '제목을 입력해주세요.' });
  if (!content?.trim()) return res.status(400).json({ error: '내용을 입력해주세요.' });

  ensureDataDir();
  const posts = loadJSON(POSTS_FILE);

  const post = {
    id: crypto.randomUUID(),
    userId: req.userId,
    title: title.trim(),
    content: content.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    viewCount: 0,
    comments: [],
  };
  posts.push(post);
  saveJSON(POSTS_FILE, posts);

  res.status(201).json(post);
});

// 게시글 상세
app.get('/api/posts/:id', (req, res) => {
  const posts = loadJSON(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

  // 조회수 증가
  post.viewCount = (post.viewCount || 0) + 1;
  saveJSON(POSTS_FILE, posts);

  const users = loadJSON(USERS_FILE);
  const userMap = {};
  users.forEach(u => { userMap[u.id] = u.nickname; });

  res.json({
    ...post,
    author: userMap[post.userId] || '익명',
    comments: (post.comments || []).map(c => ({
      ...c,
      author: userMap[c.userId] || '익명',
    })),
  });
});

// 게시글 수정
app.put('/api/posts/:id', requireAuth, (req, res) => {
  const posts = loadJSON(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  if (post.userId !== req.userId) return res.status(403).json({ error: '수정 권한이 없습니다.' });

  const { title, content } = req.body;
  if (title !== undefined) post.title = title.trim();
  if (content !== undefined) post.content = content.trim();
  post.updatedAt = Date.now();
  saveJSON(POSTS_FILE, posts);

  res.json(post);
});

// 게시글 삭제
app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const posts = loadJSON(POSTS_FILE);
  const idx = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  if (posts[idx].userId !== req.userId) return res.status(403).json({ error: '삭제 권한이 없습니다.' });

  posts.splice(idx, 1);
  saveJSON(POSTS_FILE, posts);
  res.json({ message: '삭제되었습니다.' });
});

// 댓글 작성
app.post('/api/posts/:id/comments', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });

  const posts = loadJSON(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

  if (!post.comments) post.comments = [];
  const comment = {
    id: crypto.randomUUID(),
    userId: req.userId,
    content: content.trim(),
    createdAt: Date.now(),
  };
  post.comments.push(comment);
  saveJSON(POSTS_FILE, posts);

  const users = loadJSON(USERS_FILE);
  const userMap = {};
  users.forEach(u => { userMap[u.id] = u.nickname; });

  res.status(201).json({ ...comment, author: userMap[req.userId] || '익명' });
});

// ============== 기존 주식 API ==============

app.get('/api/quote/:codes', async (req, res) => {
  try {
    const codes = req.params.codes
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    if (codes.length === 0) {
      return res.status(400).json({ error: '종목코드가 필요합니다.' });
    }

    console.log(`[Naver] ${codes.length}종목 조회: ${codes.join(', ')}`);
    const results = await getStockPrices(codes);
    res.json(results);
  } catch (err) {
    console.error('[Naver] 조회 오류:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    await getStockPrices(['005930']);
    res.json({ ok: true, api: 'Naver', ts: Date.now() });
  } catch (err) {
    res.status(503).json({ ok: false, api: 'Naver', error: err.message, ts: Date.now() });
  }
});

// ============== 서버 시작 ==============

ensureDataDir();
seedAdmin();

// 운영 환경: dist/ 정적 파일 서빙 (Render)
if (isProd) {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  // SPA fallback: 모든 비-API 경로를 index.html로
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log('[Prod] 정적 파일 서빙 활성화 (dist/)');
}

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`🚀 Stock API 서버 실행 중 (포트 ${PORT})`);
  console.log(`📡 데이터 소스: 네이버 증권 API (무인증)`);
  console.log(`👤 인증 API: /api/auth/*`);
  console.log(`📝 게시판 API: /api/posts/*`);
  console.log(`🔧 모드: ${isProd ? '운영' : '개발'}`);
  console.log('='.repeat(50));
});
