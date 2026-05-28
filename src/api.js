/**
 * Stock API module for Korean stocks
 * Vite proxy /api/quote → Express server (port 4000) → 네이버 증권 API
 */

// ===================== API 기본 URL 설정 =====================
// 개발 모드: '' (빈 문자열) → Vite 프록시가 localhost:4000 으로 전달
// 운영 모드 (단일 Render): '' → 같은 도메인에서 서빙
// 운영 모드 (GitHub Pages + Render): Render 백엔드 URL 입력
//    예: 'https://macro-stock.onrender.com'
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
// =============================================================

const CHUNK_SIZE = 10;

const KOSPI_STOCKS = {
  '005930': { name: '삼성전자', sector: 'tech' },
  '000660': { name: 'SK하이닉스', sector: 'tech' },
  '035420': { name: 'NAVER', sector: 'tech' },
  '012450': { name: '한화에어로스페이스', sector: 'defense' },
  '024110': { name: 'IBK기업은행', sector: 'finance' },
  '105560': { name: 'KB금융', sector: 'finance' },
  '055550': { name: '신한지주', sector: 'finance' },
  '000810': { name: '삼성화재', sector: 'insurance' },
  '035720': { name: '카카오', sector: 'tech' },
  '068270': { name: '셀트리온', sector: 'bio' },
  '042700': { name: '한미반도체', sector: 'tech' },
  '058470': { name: '리노공업', sector: 'tech' },
  '064350': { name: '현대로템', sector: 'defense' },
  '079550': { name: 'LIG넥스원', sector: 'defense' },
  '267260': { name: 'HD현대일렉트릭', sector: 'energy' },
  '010120': { name: 'LS일렉트릭', sector: 'energy' },
  '001440': { name: '대한전선', sector: 'energy' },
  '139130': { name: 'DGB금융지주', sector: 'finance' },
  '006360': { name: 'GS건설', sector: 'construction' },
  '004990': { name: '롯데지주', sector: 'holding' },
  '016360': { name: '삼성증권', sector: 'finance' },
  // Extended themes
  '207940': { name: '삼성바이오로직스', sector: 'bio' },
  '000100': { name: '유한양행', sector: 'bio' },
  '302440': { name: 'SK바이오사이언스', sector: 'bio' },
  '373220': { name: 'LG에너지솔루션', sector: 'battery' },
  '005490': { name: 'POSCO홀딩스', sector: 'battery' },
  '247540': { name: '에코프로비엠', sector: 'battery' },
  '096770': { name: 'SK이노베이션', sector: 'battery' },
  '086280': { name: '현대글로비스', sector: 'logistics' },
  '028670': { name: '팬오션', sector: 'logistics' },
  '001120': { name: 'LX인터내셔널', sector: 'logistics' },
  '039030': { name: '이오테크닉스', sector: 'tech' },
  '240810': { name: '원익IPS', sector: 'tech' },
  '053690': { name: '케이씨텍', sector: 'tech' },
  '277810': { name: '레인보우로보틱스', sector: 'robot' },
  '267270': { name: 'HD현대로보틱스', sector: 'robot' },
  // New additions for value themes
  '010950': { name: 'S-Oil', sector: 'energy' },
  '030200': { name: 'KT', sector: 'telecom' },
  '017670': { name: 'SK텔레콤', sector: 'telecom' },
  '316140': { name: '우리금융지주', sector: 'finance' },
  '000720': { name: '현대건설', sector: 'construction' },
  '047050': { name: '포스코인터내셔널', sector: 'trading' },
  '032830': { name: '삼성생명', sector: 'insurance' },
  '402340': { name: 'SK스퀘어', sector: 'holding' },
  '030000': { name: '제일기획', sector: 'advertising' },
  '086790': { name: '하나금융지주', sector: 'finance' },
  '011170': { name: '롯데케미칼', sector: 'chemical' },
  '051910': { name: 'LG화학', sector: 'chemical' },
  '034730': { name: 'SK', sector: 'holding' },
  '018260': { name: '삼성에스디에스', sector: 'tech' },
  '009150': { name: '삼성전기', sector: 'tech' },
  // Macro analysis referenced stocks (previously missing)
  '005380': { name: '현대차', sector: 'auto' },
  '009540': { name: 'HD현대중공업', sector: 'shipbuilding' },
  '003490': { name: '대한항공', sector: 'airline' },
};

/**
 * 종목명 → 종목코드 역방향 조회
 * - 6자리 숫자 → 그대로 반환 (알려진 종목이면 name 포함)
 * - 종목명 → KOSPI_STOCKS에서 대소문자 구분 없이 검색
 * @param {string} input - 종목코드(6자리 숫자) 또는 종목명
 * @returns {{ code: string, name: string } | null}
 */
export function lookupCode(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1) 이미 6자리 숫자 코드인 경우
  if (/^\d{6}$/.test(trimmed)) {
    const info = KOSPI_STOCKS[trimmed];
    return info ? { code: trimmed, name: info.name } : { code: trimmed, name: trimmed };
  }

  // 2) 종목명 검색 (대소문자 구분 없이)
  const query = trimmed.toLowerCase();

  // 정확히 일치하는 종목명 우선
  for (const [code, info] of Object.entries(KOSPI_STOCKS)) {
    if (info.name.toLowerCase() === query) {
      return { code, name: info.name };
    }
  }

  // 부분 일치 (포함)
  for (const [code, info] of Object.entries(KOSPI_STOCKS)) {
    if (info.name.toLowerCase().includes(query)) {
      return { code, name: info.name };
    }
  }

  // 3) 검색 결과 없음
  return null;
}

/**
 * 종목 시세 조회 (자동 chunk 분할)
 */
export async function getQuotes(codes) {
  if (!codes || codes.length === 0) return [];

  const chunks = [];
  for (let i = 0; i < codes.length; i += CHUNK_SIZE) {
    chunks.push(codes.slice(i, i + CHUNK_SIZE));
  }

  try {
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const url = `${API_BASE}/api/quote/${chunk.join(',')}`;
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`API ${res.status}: ${body}`);
        }
        return await res.json();
      })
    );

    return results.flat();
  } catch (err) {
    throw err;
  }
}

export function getStockInfo(code) {
  return KOSPI_STOCKS[code] || { name: code, sector: 'unknown' };
}

export { KOSPI_STOCKS };

// ==================== AUTH API ====================

export const TOKEN_KEY = 'macro_stock_token';
export const USER_KEY = 'macro_stock_user';

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export async function register(username, password, nickname) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, nickname }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || '회원가입 실패');
  }
  return res.json();
}

export async function login(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || '로그인 실패');
  }
  const data = await res.json();
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data;
}

export async function getMe() {
  const res = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() });
  if (!res.ok) throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
  return res.json();
}

export async function logout() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', headers: authHeaders() });
  } finally {
    clearStoredAuth();
  }
}

export function getStoredAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  const userRaw = localStorage.getItem(USER_KEY);
  if (!token || !userRaw) return null;
  try {
    const user = JSON.parse(userRaw);
    return { token, user };
  } catch {
    clearStoredAuth();
    return null;
  }
}

export function clearStoredAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ==================== BOARD API ====================

export async function fetchPosts(page = 1, limit = 20) {
  const res = await fetch(`${API_BASE}/api/posts?page=${page}&limit=${limit}`);
  if (!res.ok) throw new Error('게시글 목록을 불러오지 못했습니다.');
  return res.json();
}

export async function fetchPost(id) {
  const res = await fetch(`${API_BASE}/api/posts/${id}`);
  if (!res.ok) throw new Error('게시글을 불러오지 못했습니다.');
  return res.json();
}

export async function createPost(title, content) {
  const res = await fetch(`${API_BASE}/api/posts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title, content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || '게시글 작성 실패');
  }
  return res.json();
}

export async function updatePost(id, title, content) {
  const res = await fetch(`${API_BASE}/api/posts/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ title, content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || '게시글 수정 실패');
  }
  return res.json();
}

export async function deletePost(id) {
  const res = await fetch(`${API_BASE}/api/posts/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || '게시글 삭제 실패');
  }
  return res.json();
}

export async function addComment(postId, content) {
  const res = await fetch(`${API_BASE}/api/posts/${postId}/comments`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || '댓글 작성 실패');
  }
  return res.json();
}

// ==================== THEME RECOMMENDATIONS API ====================

export async function fetchThemes(forceRefresh = false) {
  const url = forceRefresh
    ? `${API_BASE}/api/themes?refresh=1`
    : `${API_BASE}/api/themes`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.detail || '테마 추천을 불러오지 못했습니다.');
  }
  return res.json();
}

// ==================== VALUE RECOMMENDATIONS API ====================

export async function fetchValueGroups(forceRefresh = false) {
  const url = forceRefresh
    ? `${API_BASE}/api/value?force=true`
    : `${API_BASE}/api/value`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.detail || '저평가주 데이터를 불러오지 못했습니다.');
  }
  return res.json();
}

// ==================== MACRO ANALYSIS API ====================

export async function fetchMacroAnalysis(forceRefresh = false) {
  const url = forceRefresh
    ? `${API_BASE}/api/macro?refresh=1`
    : `${API_BASE}/api/macro`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.detail || '매크로 분석을 불러오지 못했습니다.');
  }
  return res.json();
}
