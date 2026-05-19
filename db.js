/**
 * MongoDB 데이터베이스 연결 및 모델
 * - MongoDB Atlas 무료 512MB 클러스터 사용
 * - 환경변수 MONGODB_URI 에서 연결 문자열 가져옴
 */

import { MongoClient, ObjectId } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/macro-stock';
const DB_NAME = 'macro-stock';

let client = null;
let db = null;

export async function connectDB() {
  if (db) return db;
  if (!MONGODB_URI) throw new Error('MONGODB_URI 환경변수가 설정되지 않았습니다.');

  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log(`[MongoDB] 연결됨 → ${DB_NAME}`);

  // 인덱스 생성
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  await db.collection('posts').createIndex({ createdAt: -1 });
  await db.collection('posts').createIndex({ userId: 1 });

  return db;
}

export async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('[MongoDB] 연결 종료');
  }
}

function getId(id) {
  if (typeof id === 'string') {
    try { return new ObjectId(id); } catch { return id; }
  }
  return id;
}

// ==================== Users ====================

export async function findUserByUsername(username) {
  const d = await connectDB();
  return d.collection('users').findOne({ username });
}

export async function findUserById(id) {
  const d = await connectDB();
  return d.collection('users').findOne({ _id: getId(id) });
}

export async function createUser(user) {
  const d = await connectDB();
  const result = await d.collection('users').insertOne(user);
  return { ...user, _id: result.insertedId };
}

// ==================== Posts ====================

export async function getPosts(page = 1, limit = 20) {
  const d = await connectDB();
  const skip = (page - 1) * limit;
  const total = await d.collection('posts').countDocuments();
  const posts = await d.collection('posts')
    .find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
  return { posts, total };
}

export async function getPostById(id) {
  const d = await connectDB();
  return d.collection('posts').findOne({ _id: getId(id) });
}

export async function createPost(post) {
  const d = await connectDB();
  const result = await d.collection('posts').insertOne({
    ...post,
    viewCount: 0,
    comments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return { ...post, _id: result.insertedId };
}

export async function updatePost(id, updates) {
  const d = await connectDB();
  await d.collection('posts').updateOne(
    { _id: getId(id) },
    { $set: { ...updates, updatedAt: Date.now() } }
  );
  return getPostById(id);
}

export async function deletePostById(id) {
  const d = await connectDB();
  return d.collection('posts').deleteOne({ _id: getId(id) });
}

export async function incrementViewCount(id) {
  const d = await connectDB();
  return d.collection('posts').updateOne(
    { _id: getId(id) },
    { $inc: { viewCount: 1 } }
  );
}

export async function addCommentToPost(postId, comment) {
  const d = await connectDB();
  return d.collection('posts').updateOne(
    { _id: getId(postId) },
    { $push: { comments: comment } }
  );
}

// ==================== Seed ====================

export async function seedAdmin() {
  const d = await connectDB();
  const existing = await d.collection('users').findOne({ username: 'ysk' });
  if (existing) return;

  const crypto = await import('crypto');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync('admin', salt, 10000, 64, 'sha512').toString('hex');
  await d.collection('users').insertOne({
    username: 'ysk',
    nickname: '관리자',
    salt,
    hash,
    createdAt: Date.now(),
  });
  console.log('[Seed] 관리자 계정 생성됨 (ysk / admin)');
}
