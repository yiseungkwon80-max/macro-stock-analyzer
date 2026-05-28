/**
 * 네이버 증권 API Express 서버 + 인증 + 게시판 (MongoDB)
 * - /api/quote/:codes → 네이버 주식 현재가 조회
 * - /api/health      → 서버 헬스체크
 * - /api/auth/*      → 인증 (회원가입/로그인/로그아웃)
 * - /api/posts/*     → 게시판 (CRUD + 댓글)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { getStockPrices } from './naver-api.js';
import {
  connectDB, closeDB, seedAdmin,
  findUserByUsername, findUserById, createUser,
  getPosts, getPostById, createPost, updatePost, deletePostById,
  incrementViewCount, addCommentToPost,
} from './db.js';
import { getMacroAnalysis } from './macro-news.js';
import { getThemeRecommendations } from './theme-recommender.js';
import { getValueRecommendations } from './value-recommender.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;
const isProd = process.env.NODE_ENV === 'production';

// CORS: 개발 중에는 모든 출처 허용, 운영 환경에서는 프론트엔드 도메인만
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : true,
  credentials: true,
}));
app.use(express.json());

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

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요.' });
    }
    if (username.length < 3) return res.status(400).json({ error: '아이디는 3자 이상이어야 합니다.' });
    if (password.length < 4) return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });

    const existing = await findUserByUsername(username);
    if (existing) return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');

    const user = await createUser({
      username,
      nickname: nickname || username,
      salt,
      hash,
      createdAt: Date.now(),
    });

    res.status(201).json({ message: '회원가입 성공!', userId: user._id.toString() });
  } catch (err) {
    console.error('[Auth] register error:', err);
    res.status(500).json({ error: '회원가입 처리 중 오류가 발생했습니다.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요.' });
    }

    const user = await findUserByUsername(username);
    if (!user) return res.status(401).json({ error: '아이디 또는 비밀번호가 일치하지 않습니다.' });

    const hash = crypto.pbkdf2Sync(password, user.salt, 10000, 64, 'sha512').toString('hex');
    if (hash !== user.hash) return res.status(401).json({ error: '아이디 또는 비밀번호가 일치하지 않습니다.' });

    const token = generateToken();
    TOKENS.set(token, { userId: user._id.toString(), expiredAt: Date.now() + 24 * 60 * 60 * 1000 });

    res.json({
      token,
      user: { id: user._id.toString(), username: user.username, nickname: user.nickname, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error('[Auth] login error:', err);
    res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await findUserById(req.userId);
    if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json({ id: user._id.toString(), username: user.username, nickname: user.nickname, createdAt: user.createdAt });
  } catch (err) {
    console.error('[Auth] me error:', err);
    res.status(500).json({ error: '인증 확인 중 오류가 발생했습니다.' });
  }
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  TOKENS.delete(req.token);
  res.json({ message: '로그아웃되었습니다.' });
});

// ============== 게시판 API ==============

app.get('/api/posts', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { posts, total } = await getPosts(page, limit);

    const result = [];
    for (const p of posts) {
      let author = '익명';
      if (p.userId) {
        const u = await findUserById(p.userId);
        if (u) author = u.nickname;
      }
      result.push({
        id: p._id.toString(),
        title: p.title,
        author,
        createdAt: p.createdAt,
        viewCount: p.viewCount || 0,
        commentCount: (p.comments || []).length,
      });
    }

    res.json({
      posts: result,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[Posts] list error:', err);
    res.status(500).json({ error: '게시글 목록 조회 중 오류가 발생했습니다.' });
  }
});

app.post('/api/posts', requireAuth, async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: '제목을 입력해주세요.' });
    if (!content?.trim()) return res.status(400).json({ error: '내용을 입력해주세요.' });

    const post = await createPost({
      userId: req.userId,
      title: title.trim(),
      content: content.trim(),
    });

    res.status(201).json({
      id: post._id.toString(),
      userId: post.userId,
      title: post.title,
      content: post.content,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      viewCount: post.viewCount,
      comments: post.comments,
    });
  } catch (err) {
    console.error('[Posts] create error:', err);
    res.status(500).json({ error: '게시글 작성 중 오류가 발생했습니다.' });
  }
});

app.get('/api/posts/:id', async (req, res) => {
  try {
    const post = await getPostById(req.params.id);
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

    await incrementViewCount(req.params.id);

    let author = '익명';
    if (post.userId) {
      const u = await findUserById(post.userId);
      if (u) author = u.nickname;
    }

    const comments = [];
    for (const c of (post.comments || [])) {
      let ca = '익명';
      if (c.userId) {
        const u = await findUserById(c.userId);
        if (u) ca = u.nickname;
      }
      comments.push({ ...c, author: ca, id: c._id?.toString?.() || c.id });
    }

    res.json({
      ...post,
      id: post._id.toString(),
      author,
      comments,
    });
  } catch (err) {
    console.error('[Posts] detail error:', err);
    res.status(500).json({ error: '게시글 조회 중 오류가 발생했습니다.' });
  }
});

app.put('/api/posts/:id', requireAuth, async (req, res) => {
  try {
    const post = await getPostById(req.params.id);
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    if (post.userId !== req.userId) return res.status(403).json({ error: '수정 권한이 없습니다.' });

    const { title, content } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title.trim();
    if (content !== undefined) updates.content = content.trim();

    const updated = await updatePost(req.params.id, updates);
    res.json({ ...updated, id: updated._id.toString() });
  } catch (err) {
    console.error('[Posts] update error:', err);
    res.status(500).json({ error: '게시글 수정 중 오류가 발생했습니다.' });
  }
});

app.delete('/api/posts/:id', requireAuth, async (req, res) => {
  try {
    const post = await getPostById(req.params.id);
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    if (post.userId !== req.userId) return res.status(403).json({ error: '삭제 권한이 없습니다.' });

    await deletePostById(req.params.id);
    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    console.error('[Posts] delete error:', err);
    res.status(500).json({ error: '게시글 삭제 중 오류가 발생했습니다.' });
  }
});

app.post('/api/posts/:id/comments', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });

    const post = await getPostById(req.params.id);
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

    const comment = {
      id: crypto.randomUUID(),
      userId: req.userId,
      content: content.trim(),
      createdAt: Date.now(),
    };
    await addCommentToPost(req.params.id, comment);

    let author = '익명';
    const u = await findUserById(req.userId);
    if (u) author = u.nickname;

    res.status(201).json({ ...comment, author });
  } catch (err) {
    console.error('[Posts] comment error:', err);
    res.status(500).json({ error: '댓글 작성 중 오류가 발생했습니다.' });
  }
});

// ============== 주식 API ==============

app.get('/api/quote/:codes', async (req, res) => {
  try {
    const codes = req.params.codes.split(',').map(c => c.trim()).filter(Boolean);
    if (codes.length === 0) return res.status(400).json({ error: '종목코드가 필요합니다.' });

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

// ============== 매크로 분석 API ==============

app.get('/api/macro', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    const analysis = await getMacroAnalysis(forceRefresh);
    res.json(analysis);
  } catch (err) {
    console.error('[Macro] 분석 오류:', err.message);
    res.status(500).json({ error: '매크로 분석 중 오류가 발생했습니다.', detail: err.message });
  }
});

// ============== 테마 추천 API ==============

app.get('/api/themes', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    const recommendations = await getThemeRecommendations(forceRefresh);
    res.json(recommendations);
  } catch (err) {
    console.error('[Themes] 추천 오류:', err.message);
    res.status(500).json({ error: '테마 추천 생성 중 오류가 발생했습니다.', detail: err.message });
  }
});

// ============== 저평가주 발굴 API ==============

app.get('/api/value', async (req, res) => {
  try {
    const forceRefresh = req.query.force === 'true';
    const recommendations = await getValueRecommendations(forceRefresh);
    res.json(recommendations);
  } catch (err) {
    console.error('[Value] 발굴 오류:', err.message);
    res.status(500).json({ error: '저평가주 발굴 중 오류가 발생했습니다.', detail: err.message });
  }
});

// ============== 정적 파일 서빙 (운영) ==============

// dist/ 정적 파일 서빙 (항상 활성화)
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});
console.log('[Server] 정적 파일 서빙 활성화 (dist/)');

// ============== 서버 시작 ==============

async function startServer() {
  try {
    await connectDB();
    await seedAdmin();
    console.log(`🗄️  데이터베이스: MongoDB 연결됨`);
  } catch (err) {
    console.warn('[Server] MongoDB 연결 실패 (인증/게시판 비활성화):', err.message);
    console.warn('[Server] 매크로 분석 + 주식 API는 정상 작동합니다.');
  }

  app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`🚀 Macro Stock Analyzer 서버 실행 중 (포트 ${PORT})`);
    console.log(`📡 데이터 소스: 네이버 증권 API (무인증)`);
    console.log(`👤 인증 API: /api/auth/*`);
    console.log(`📝 게시판 API: /api/posts/*`);
    console.log(`📊 매크로 분석: /api/macro`);
    console.log(`🔥 테마 추천: /api/themes`);
    console.log(`💎 저평가주 발굴: /api/value`);
    console.log(`🔧 모드: ${isProd ? '운영' : '개발'}`);
    console.log('='.repeat(50));
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM 수신, 종료 중...');
  await closeDB();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT 수신, 종료 중...');
  await closeDB();
  process.exit(0);
});

startServer();
