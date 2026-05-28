/**
 * 네이버 증권 API 모듈
 * - 별도 인증 불필요 (무료·무인증)
 * - 국내 주식(KOSPI/KOSDAQ) 실시간 시세 + 기본적 분석 데이터 조회
 *
 * 사용 API:
 *   1. 실시간 시세: GET https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:{code}
 *   2. 기본적 분석: GET https://m.stock.naver.com/api/stock/{code}/integration
 */

const NAVER_POLLING = 'https://polling.finance.naver.com/api/realtime';
const NAVER_INTEGRATION = 'https://m.stock.naver.com/api/stock';

// ──────────────── Helpers ────────────────

/**
 * 한국어 숫자 단위 파싱 (예: "1,596조 341억" → 1596034100000000)
 */
function parseKoreanMarketCap(value) {
  if (!value) return null;
  const cleaned = value.replace(/,/g, '').trim();
  let result = 0;

  const joMatch = cleaned.match(/([\d.]+)\s*조/);
  if (joMatch) {
    result += parseFloat(joMatch[1]) * 1e12;
  }

  const eokMatch = cleaned.match(/([\d.]+)\s*억/);
  if (eokMatch) {
    result += parseFloat(eokMatch[1]) * 1e8;
  }

  const manMatch = cleaned.match(/([\d.]+)\s*만/);
  if (manMatch) {
    result += parseFloat(manMatch[1]) * 1e4;
  }

  if (result === 0 && !isNaN(cleaned)) {
    result = parseInt(cleaned, 10);
  }

  return result > 0 ? result : null;
}

/** "41.59배" → 41.59, "0.61%" → 0.61 */
function parseKoreanFloat(value) {
  if (!value) return null;
  return parseFloat(value.replace(/,/g, '').replace(/[배%원]/, '')) || null;
}

// ──────────────── API Calls ────────────────

/**
 * 실시간 현재가 (폴링 API)
 */
async function fetchStockRealtime(code) {
  const url = `${NAVER_POLLING}?query=SERVICE_ITEM:${code}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`네이버 API 응답 오류 (${res.status})`);
  }

  const data = await res.json();
  const areas = data?.result?.areas;

  if (!areas || areas.length === 0) {
    throw new Error(`${code}: 데이터 없음`);
  }

  const ds = areas[0].datas;
  if (!ds || ds.length === 0) {
    throw new Error(`${code}: 시세 데이터 없음`);
  }

  const d = ds[0];
  const price = parseFloat(d.nv || 0);
  const prev = parseFloat(d.sv || price);
  const change = price - prev;
  const changePercent = prev > 0 ? (change / prev) * 100 : 0;

  const rawName = d.nm || code;
  const name = rawName.replace(/^SERVICE_ITEM:/, '').trim();

  return {
    code,
    name,
    price,
    previousClose: parseFloat(d.sv || 0),
    change: Math.round(change),
    changePercent: parseFloat(changePercent.toFixed(2)),
    open: parseFloat(d.ov || 0),
    dayHigh: parseFloat(d.hv || 0),
    dayLow: parseFloat(d.lv || 0),
    volume: parseInt(d.aq || '0', 10) || 0,
    currency: 'KRW',
    marketState: d.ms || 'CLOSE',
  };
}

/**
 * 기본적 분석 데이터 (통합 API)
 */
async function fetchStockFundamentals(code) {
  try {
    const url = `${NAVER_INTEGRATION}/${code}/integration`;
    const res = await fetch(url);

    if (!res.ok) return null;

    const data = await res.json();
    const infos = data?.totalInfos;
    if (!infos || infos.length === 0) return null;

    const getValue = (infoCode) => {
      const item = infos.find((i) => i.code === infoCode);
      return item?.value || null;
    };

    return {
      code,
      marketCap: parseKoreanMarketCap(getValue('marketValue')),
      per: parseKoreanFloat(getValue('per')),
      cnsPer: parseKoreanFloat(getValue('cnsPer')),
      pbr: parseKoreanFloat(getValue('pbr')),
      eps: parseKoreanFloat(getValue('eps')),
      cnsEps: parseKoreanFloat(getValue('cnsEps')),
      bps: parseKoreanFloat(getValue('bps')),
      divYield: parseKoreanFloat(getValue('dividendYieldRatio')),
      high52: parseKoreanFloat(getValue('highPriceOf52Weeks')),
      low52: parseKoreanFloat(getValue('lowPriceOf52Weeks')),
      foreignRate: parseKoreanFloat(getValue('foreignRate')),
    };
  } catch {
    return null;
  }
}

/**
 * 단일 종목 통합 조회 (실시간 시세 + 기본적 분석 병합)
 * @param {string} code - 종목코드 6자리 (예: '005930')
 * @returns {object} 표준화된 주식 데이터
 */
async function fetchStock(code) {
  const [realtime, fundamentals] = await Promise.allSettled([
    fetchStockRealtime(code),
    fetchStockFundamentals(code),
  ]);

  if (realtime.status === 'rejected') {
    throw realtime.reason;
  }

  const stock = realtime.value;
  const fund = fundamentals.status === 'fulfilled' ? fundamentals.value : null;

  return {
    ...stock,
    marketCap: fund?.marketCap || null,
    per: fund?.per || null,
    cnsPer: fund?.cnsPer || null,
    pbr: fund?.pbr || null,
    eps: fund?.eps || null,
    cnsEps: fund?.cnsEps || null,
    bps: fund?.bps || null,
    divYield: fund?.divYield || null,
    high52: fund?.high52 || null,
    low52: fund?.low52 || null,
    foreignRate: fund?.foreignRate || null,
  };
}

/**
 * USD/KRW 실시간 환율 조회 (Dunamu 외환 API)
 * @returns {number|null} 현재 USD/KRW 환율
 */
export async function getUSDKRW() {
  try {
    const res = await fetch('https://quotation-api-cdn.dunamu.com/v1/forex/recent?codes=FRX.KRWUSD');
    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0]?.basePrice || null;
  } catch {
    return null;
  }
}

/**
 * 여러 종목 동시 조회 (병렬)
 * @param {string[]} codes - 종목코드 배열
 * @returns {object[]} 각 종목 현재가 배열
 */
export async function getStockPrices(codes) {
  const results = await Promise.allSettled(
    codes.map((code) => fetchStock(code))
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      code: codes[i],
      name: codes[i],
      price: 0,
      previousClose: 0,
      change: 0,
      changePercent: 0,
      currency: 'KRW',
      error: r.reason?.message || '조회 실패',
    };
  });
}
