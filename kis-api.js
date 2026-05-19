/**
 * 한국투자증권 KIS OpenAPI 모듈
 * - 토큰 발급·자동갱신
 * - 주식 현재가 조회 (개별 + 배치)
 */

import https from 'https';
import crypto from 'crypto';

const KIS_HOST = 'openapi.koreainvestment.com';
const KIS_PORT = 9443;
const TOKEN_MAX_AGE_MS = 23 * 60 * 60 * 1000; // 23시간 (24시간 만료에서 1시간 여유)

let cachedToken = null;
let tokenExpiresAt = 0;

function getAppKey() {
  const key = process.env.KIS_APP_KEY;
  if (!key) throw new Error('KIS_APP_KEY 환경변수가 설정되지 않았습니다.');
  return key;
}

function getAppSecret() {
  const secret = process.env.KIS_APP_SECRET;
  if (!secret) throw new Error('KIS_APP_SECRET 환경변수가 설정되지 않았습니다.');
  return secret;
}

/**
 * KIS OpenAPI POST 요청 헬퍼 (Keep-Alive)
 */
function kisRequest(path, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: KIS_HOST,
      port: KIS_PORT,
      path,
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.rt_cd !== '0' && json.rt_cd !== undefined && json.rt_cd !== '0') {
            reject(new Error(`KIS API 오류 [${json.rt_cd}]: ${json.msg1 || '알 수 없는 오류'}`));
            return;
          }
          resolve(json);
        } catch (e) {
          reject(new Error(`KIS 응답 파싱 실패 (${res.statusCode}): ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * access_token 발급 (토큰 재사용, 만료 시 자동 갱신)
 */
export async function getAccessToken() {
  const now = Date.now();

  // 캐시된 토큰이 유효하면 재사용
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const appkey = getAppKey();
  const appsecret = getAppSecret();

  const json = await kisRequest('/oauth2/tokenP', {}, {
    grant_type: 'client_credentials',
    appkey,
    appsecret,
  });

  if (json.access_token) {
    cachedToken = json.access_token;
    tokenExpiresAt = now + (json.expires_in ? json.expires_in * 1000 : TOKEN_MAX_AGE_MS) - 3600_000;
    console.log('KIS 토큰 발급 성공, 만료:', new Date(tokenExpiresAt).toLocaleString());
    return cachedToken;
  }

  throw new Error(`토큰 발급 실패: ${JSON.stringify(json)}`);
}

/**
 * 단일 종목 현재가 조회
 * @param {string} code - 종목코드 6자리 (예: '005930')
 * @returns {object} 주식 현재가 정보
 */
export async function getStockPrice(code) {
  const token = await getAccessToken();
  const appkey = getAppKey();
  const appsecret = getAppSecret();

  const json = await kisRequest('/uapi/domestic-stock/v1/quotations/inquire-price', {
    authorization: `Bearer ${token}`,
    appkey,
    appsecret,
    tr_id: 'FHKST01010100',
    custtype: 'P',
  }, {
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: code,
  });

  // KIS 응답을 표준화된 형식으로 변환
  const o = json.output || {};
  return {
    code,
    name: o.hts_kor_isnm || '',                       // 종목명
    price: parseFloat(o.stck_prpr) || 0,               // 현재가
    previousClose: parseFloat(o.stck_oprc) || 0,        // 시가
    change: parseFloat(o.prdy_vrss) || 0,               // 전일대비
    changePercent: parseFloat(o.prdy_ctrt) || 0,        // 등락률(%)
    open: parseFloat(o.stck_oprc) || 0,                 // 시가
    dayHigh: parseFloat(o.stck_hgpr) || 0,              // 고가
    dayLow: parseFloat(o.stck_lwpr) || 0,               // 저가
    volume: parseInt(o.acml_vol, 10) || 0,              // 거래량
    marketCap: parseFloat(o.hts_avls) || 0,             // 시가총액 (원)
    per: parseFloat(o.per) || null,                     // PER
    pbr: parseFloat(o.pbr) || null,                     // PBR
    eps: parseFloat(o.eps) || null,                     // EPS
    bps: parseFloat(o.bps) || null,                     // BPS
    high52: parseFloat(o.w52_hgpr) || null,             // 52주 최고
    low52: parseFloat(o.w52_lwpr) || null,              // 52주 최저
    currency: 'KRW',
    marketState: 'OPEN', // KIS API는 시장 상태 별도 제공 안 함
  };
}

/**
 * 여러 종목 동시 조회 (병렬)
 * @param {string[]} codes - 종목코드 배열
 * @returns {object[]} 각 종목 현재가 배열
 */
export async function getStockPrices(codes) {
  const results = await Promise.allSettled(
    codes.map(async (code) => {
      // KIS API rate limit: 1초에 1회 권장 → 200ms 간격
      const result = await getStockPrice(code);
      return result;
    })
  );

  // 요청 간 최소 간격 확보
  const batchDelay = Math.min(codes.length * 50, 200);
  await new Promise((r) => setTimeout(r, batchDelay));

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      code: codes[i],
      name: codes[i],
      price: 0,
      error: r.reason?.message || '조회 실패',
    };
  });
}
