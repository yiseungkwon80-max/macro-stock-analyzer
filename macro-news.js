/**
 * 매크로 뉴스 분석 모듈
 * - Google News RSS에서 한국 금융·증시 뉴스 수집
 * - 키워드 기반 매크로 이벤트 감지
 * - 구조화된 매크로 분석 데이터 생성
 * - 6시간 캐시 (오전/오후 자동 갱신)
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6시간 (오전/오후 갱신)
const RSS_URLS = [
  'https://news.google.com/rss/search?q=%ED%95%9C%EA%B5%AD%EC%9D%80%ED%96%89+%EA%B8%88%EB%A6%AC+FOMC+%EC%A6%9D%EC%8B%9C&hl=ko&gl=KR&ceid=KR:ko',
  'https://news.google.com/rss/search?q=%EC%BD%94%EC%8A%A4%ED%94%BC+%ED%99%98%EC%9C%A8+%EB%A7%A4%ED%81%AC%EB%A1%9C+%EA%B2%BD%EC%A0%9C&hl=ko&gl=KR&ceid=KR:ko',
];

// ── 캐시 ──
let cachedAnalysis = null;
let cacheTimestamp = 0;

// ── RSS 파싱 헬퍼 ──
function parseRssXML(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title>(.*?)<\/title>/i) || [])[1] || '';
    const link = (block.match(/<link>(.*?)<\/link>/i) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/i) || [])[1] || '';
    const description = (block.match(/<description>(.*?)<\/description>/i) || [])[1] || '';
    const cleanTitle = title
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const cleanDesc = description
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    if (cleanTitle && !cleanTitle.includes('Google 뉴스')) {
      items.push({
        title: cleanTitle,
        link,
        pubDate: new Date(pubDate),
        description: cleanDesc,
      });
    }
  }
  return items;
}

// ── 뉴스 수집 ──
async function fetchNewsFromRSS(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssXML(xml);
  } catch (err) {
    console.error(`[MacroNews] RSS fetch failed: ${url}`, err.message);
    return [];
  }
}

async function collectAllNews() {
  const results = await Promise.all(RSS_URLS.map(fetchNewsFromRSS));
  const allNews = results.flat();
  // 중복 제거 (제목 기준)
  const seen = new Set();
  const unique = [];
  for (const item of allNews) {
    const key = item.title.slice(0, 60);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  // 날짜순 정렬 (최신순)
  unique.sort((a, b) => b.pubDate - a.pubDate);
  return unique;
}

// ── 키워드 기반 이벤트 감지 ──
const EVENT_PATTERNS = [
  {
    type: 'rate_hike',
    keywords: ['금리 인상', '금리인상', '기준금리 인상', '긴축', '매파', 'rate hike'],
    title: '한국은행 기준금리 인상',
    icon: '🏦',
    eventType: 'rate_decision',
    impactRating: 'HIGH',
  },
  {
    type: 'rate_cut',
    keywords: ['금리 인하', '금리인하', '기준금리 인하', '금리 동결 해제', '완화', '비둘기파', 'rate cut', 'dovish'],
    title: '한국은행 기준금리 인하',
    icon: '🏦',
    eventType: 'rate_decision',
    impactRating: 'HIGH',
  },
  {
    type: 'rate_hold',
    keywords: ['금리 동결', '금리동결', '기준금리 동결', 'FOMC 동결', '연준 동결'],
    title: '기준금리 동결',
    icon: '🏦',
    eventType: 'rate_decision',
    impactRating: 'HIGH',
  },
  {
    type: 'inflation',
    keywords: ['물가', '인플레이션', 'CPI', '소비자물가', '생산자물가', 'PPI', 'inflation'],
    title: '물가 지표 발표',
    icon: '📈',
    eventType: 'economic_data',
    impactRating: 'HIGH',
  },
  {
    type: 'gdp',
    keywords: ['GDP', '성장률', '경제성장률', '국내총생산'],
    title: 'GDP 성장률 발표',
    icon: '📊',
    eventType: 'economic_data',
    impactRating: 'MEDIUM',
  },
  {
    type: 'export',
    keywords: ['수출', '무역수지', '수출 증가', '수출 감소', '경상수지'],
    title: '수출·무역 지표',
    icon: '🚢',
    eventType: 'economic_data',
    impactRating: 'MEDIUM',
  },
  {
    type: 'geopolitics',
    keywords: ['전쟁', '분쟁', '제재', '관세', '무역전쟁', '지정학'],
    title: '지정학적 리스크',
    icon: '🌍',
    eventType: 'geopolitics',
    impactRating: 'HIGH',
  },
  {
    type: 'oil',
    keywords: ['유가', '원유', '국제유가', 'OPEC', '에너지'],
    title: '국제 유가 변동',
    icon: '🛢️',
    eventType: 'commodity',
    impactRating: 'MEDIUM',
  },
];

function detectMacroEvents(newsItems) {
  const eventScores = {};
  const matchedHeadlines = {};

  for (const pattern of EVENT_PATTERNS) {
    eventScores[pattern.type] = 0;
    matchedHeadlines[pattern.type] = [];
  }

  for (const item of newsItems.slice(0, 50)) {
    const text = (item.title + ' ' + item.description).toLowerCase();
    for (const pattern of EVENT_PATTERNS) {
      for (const kw of pattern.keywords) {
        if (text.includes(kw.toLowerCase())) {
          eventScores[pattern.type] += 1;
          matchedHeadlines[pattern.type].push(item.title);
          break;
        }
      }
    }
  }

  const ranked = Object.entries(eventScores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  return { ranked, matchedHeadlines };
}

// ── 매크로 분석 생성 ──
function generateMacroAnalysis(newsItems, detectedEvents) {
  const { ranked, matchedHeadlines } = detectedEvents;
  const topEvent = ranked[0];
  const eventPattern = EVENT_PATTERNS.find(p => p.type === topEvent?.[0]);

  if (!eventPattern) {
    return generateDefaultAnalysis(newsItems);
  }

  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);
  const hour = today.getHours();
  const session = hour < 12 ? '오전' : '오후';

  const topHeadlines = (matchedHeadlines[eventPattern.type] || []).slice(0, 5);

  const analysisMap = {
    rate_hike: buildRateHikeAnalysis(topHeadlines, dateStr, session),
    rate_hold: buildRateHoldAnalysis(topHeadlines, dateStr, session),
    rate_cut: buildRateCutAnalysis(topHeadlines, dateStr, session),
    inflation: buildInflationAnalysis(topHeadlines, dateStr, session),
    gdp: buildGDPAnalysis(topHeadlines, dateStr, session),
    export: buildExportAnalysis(topHeadlines, dateStr, session),
    geopolitics: buildGeopoliticsAnalysis(topHeadlines, dateStr, session),
    oil: buildOilAnalysis(topHeadlines, dateStr, session),
  };

  const analysis = analysisMap[eventPattern.type] || generateDefaultAnalysis(newsItems);

  const recentHeadlines = newsItems.slice(0, 8).map(item => item.title);

  return {
    ...analysis,
    generated_at: today.toISOString(),
    session,
    source: 'Google News RSS (한국 금융·증시)',
    news_headlines: recentHeadlines,
  };
}

// ── 시나리오별 분석 템플릿 ──

function buildRateHoldAnalysis(headlines, dateStr, session) {
  return {
    summary: `한국은행이 기준금리를 동결하며 관망 기조를 유지했습니다. ${headlines[0] || ''} 금리 동결로 금융주는 안정적인 예대마진을 유지할 수 있고, 성장주도 추가적인 밸류에이션 압박에서 벗어날 수 있습니다. 시장은 향후 금리 인하 시점에 주목하고 있습니다.`,
    macro_event: `기준금리 동결 (${session} 분석)`,
    event_date: dateStr,
    event_type: 'rate_decision',
    impact_rating: 'HIGH',
    key_data: {
      rate_decision: '동결 (현행 유지)',
      policy_stance: '관망 기조',
      inflation_outlook: 'PCE 2.6% (안정세)',
      gdp_outlook: 'GDP 2.1% 전망',
      unemployment: '실업률 4.1% 전망',
    },
    beneficiary_stocks: [
      { name: 'KB금융', code: '105560', expected_upside: '+5~8%', action: '매수', benefit_reason: '금리 동결로 안정적 예대마진 유지. 고배당 매력 부각' },
      { name: '신한지주', code: '055550', expected_upside: '+4~7%', action: '매수', benefit_reason: '견조한 대출 성장 + NIM 안정. 자사주 매입 기대' },
      { name: '삼성전자', code: '005930', expected_upside: '+3~6%', action: '매수', benefit_reason: '반도체 업황 회복 + 금리 안정기 수혜. 외국인 수급 개선' },
    ],
    damage_stocks: [
      { name: '현대건설', code: '000720', expected_downside: '-3~5%', action: '관망', damage_reason: '고금리 지속으로 PF 부담. 주택 분양 실적 둔화 가능성' },
      { name: '롯데케미칼', code: '011170', expected_downside: '-3~5%', action: '관망', damage_reason: '고금리 지속으로 화학 업황 회복 지연' },
    ],
    sector_map: [
      { sector: '은행', impact: '수혜', reason: '예대마진 안정적 유지' },
      { sector: '보험', impact: '수혜', reason: '투자수익률 안정' },
      { sector: '반도체', impact: '수혜', reason: '업황 회복 + 금리 안정' },
      { sector: '건설', impact: '피해', reason: '고금리 지속, PF 리스크' },
      { sector: '화학', impact: '피해', reason: '업황 회복 지연' },
      { sector: '음식료', impact: '중립', reason: '방어주 수요 안정적' },
      { sector: '자동차', impact: '중립', reason: '수출 비중에 따른 차별화' },
    ],
    hedge_strategy: '금리 동결 국면에서는 금융주 비중을 유지하면서 반도체·IT 대형주 중심의 포트폴리오를 구축하는 것이 유효합니다. 변동성에 대비해 배당주 ETF와 금 ETF를 통한 분산 투자를 권장합니다.',
    watch_points: [
      '다음 금통위 일정',
      '美 FOMC 의사록',
      '외국인 수급 동향',
      '국내 1분기 GDP 확정치',
    ],
  };
}

function buildRateHikeAnalysis(headlines, dateStr, session) {
  return {
    summary: `한국은행이 기준금리를 인상하며 긴축 기조를 강화했습니다. ${headlines[0] || ''} 금리 인상으로 은행·보험 등 금융주는 수혜가 예상되나 성장주와 건설주는 부담이 커질 전망입니다.`,
    macro_event: `한국은행 기준금리 인상 (${session} 분석)`,
    event_date: dateStr,
    event_type: 'rate_decision',
    impact_rating: 'HIGH',
    key_data: {
      rate_decision: '기준금리 인상 (긴축)',
      policy_stance: '긴축 기조 강화',
      inflation_outlook: '물가 안정 목표 2.0%',
      gdp_outlook: 'GDP 2.0% 내외 전망',
      unemployment: '실업률 3.0% 내외',
    },
    beneficiary_stocks: [
      { name: 'KB금융', code: '105560', expected_upside: '+10~15%', action: '매수', benefit_reason: '금리 인상으로 예대마진 개선. 순이자마진(NIM) 상승 효과' },
      { name: '신한지주', code: '055550', expected_upside: '+8~12%', action: '매수', benefit_reason: '견조한 대출 성장 + NIM 개선. 자사주 매입 기대' },
      { name: '삼성화재', code: '000810', expected_upside: '+5~8%', action: '매수', benefit_reason: '금리 상승기 투자수익률 개선. IFRS17 효과' },
    ],
    damage_stocks: [
      { name: 'NAVER', code: '035420', expected_downside: '-8~12%', action: '비중축소', damage_reason: '고PER 성장주 밸류에이션 부담. 할인율 증가' },
      { name: '카카오', code: '035720', expected_downside: '-7~11%', action: '비중축소', damage_reason: '성장주 센티먼트 악화. 광고 경기 둔화 우려' },
      { name: '셀트리온', code: '068270', expected_downside: '-5~9%', action: '관망', damage_reason: '바이오 섹터 금리 민감도. R&D 금융비용 증가' },
    ],
    sector_map: [
      { sector: '은행', impact: '수혜', reason: '예대마진 개선, NIM 상승' },
      { sector: '보험', impact: '수혜', reason: '투자수익률 상승' },
      { sector: '바이오', impact: '피해', reason: '금리 민감도, R&D 비용 부담' },
      { sector: '건설', impact: '피해', reason: '금융비용 증가, PF 우려' },
      { sector: '에너지', impact: '중립', reason: '원자재 가격과 금리 상쇄 효과' },
      { sector: '음식료', impact: '중립', reason: '방어주 선호, 내수 소비 안정적' },
      { sector: '자동차', impact: '중립', reason: '수출 경쟁력 vs 금융비용 상쇄' },
    ],
    hedge_strategy: '금리 인상 국면에서는 금융주(은행·보험) 비중 확대와 성장주 비중 축소가 유효합니다. 단기채 ETF 또는 MMF를 통한 현금 비중 확대로 금리 인상 수혜를 누리면서 안정성을 확보하시기 바랍니다.',
    watch_points: [
      '다음 금통위 일정 및 금리 전망',
      '美 FOMC 의사록 및 점도표',
      '가계부채 증가율 추이',
      '부동산 PF 연체율 동향',
    ],
  };
}

function buildRateCutAnalysis(headlines, dateStr, session) {
  return {
    summary: `한국은행이 기준금리를 인하하며 완화 기조로 전환했습니다. ${headlines[0] || ''} 성장주·바이오주 밸류에이션 회복이 기대되며 건설·부동산 섹터도 수혜가 예상됩니다.`,
    macro_event: `한국은행 기준금리 인하 (${session} 분석)`,
    event_date: dateStr,
    event_type: 'rate_decision',
    impact_rating: 'HIGH',
    key_data: {
      rate_decision: '기준금리 인하',
      policy_stance: '완화 기조 전환',
      inflation_outlook: '물가 안정세',
      gdp_outlook: 'GDP 성장률 개선 기대',
      unemployment: '실업률 안정',
    },
    beneficiary_stocks: [
      { name: 'NAVER', code: '035420', expected_upside: '+10~15%', action: '매수', benefit_reason: '금리 인하로 성장주 밸류에이션 회복' },
      { name: '카카오', code: '035720', expected_upside: '+8~12%', action: '매수', benefit_reason: '고PER 성장주 센티먼트 개선' },
      { name: '셀트리온', code: '068270', expected_upside: '+7~10%', action: '매수', benefit_reason: '바이오 섹터 금리 완화 수혜' },
    ],
    damage_stocks: [
      { name: 'KB금융', code: '105560', expected_downside: '-5~8%', action: '비중축소', damage_reason: '금리 인하로 예대마진 축소' },
      { name: '신한지주', code: '055550', expected_downside: '-4~7%', action: '비중축소', damage_reason: '대출 금리 하락으로 수익성 둔화' },
    ],
    sector_map: [
      { sector: '바이오', impact: '수혜', reason: '금리 민감도 완화, R&D 비용 감소' },
      { sector: '건설', impact: '수혜', reason: '금융비용 감소, PF 부담 완화' },
      { sector: '은행', impact: '피해', reason: '예대마진 축소' },
      { sector: '보험', impact: '피해', reason: '투자수익률 하락 가능성' },
      { sector: '음식료', impact: '중립', reason: '내수 소비 심리 개선' },
      { sector: '자동차', impact: '중립', reason: '할부 금리 하락 긍정적' },
      { sector: '에너지', impact: '중립', reason: '원자재 가격과 상쇄' },
    ],
    hedge_strategy: '금리 인하 국면에서는 성장주와 바이오주 비중 확대가 유효하며, 장기채 ETF로 듀레이션 전략을 병행하시기 바랍니다. 은행주 비중은 축소하되 배당수익률 높은 보험주로 대체를 권장합니다.',
    watch_points: [
      '추가 금리 인하 가능성',
      '美 FOMC 금리 전망',
      '국내 부동산 시장 회복 신호',
      '소비자심리지수 추이',
    ],
  };
}

function buildInflationAnalysis(headlines, dateStr, session) {
  return {
    summary: `소비자물가(CPI) 지표가 발표되며 시장의 금리 경로 예상에 영향을 주고 있습니다. ${headlines[0] || ''} 물가 안정세 지속 시 금리 인하 기대가 확대될 수 있어 성장주에 긍정적입니다.`,
    macro_event: `물가 지표 발표 (${session} 분석)`,
    event_date: dateStr,
    event_type: 'economic_data',
    impact_rating: 'HIGH',
    key_data: {
      rate_decision: '데이터 의존적',
      policy_stance: '물가 지표 주시',
      inflation_outlook: 'PCE 2.6% (변동 가능)',
      gdp_outlook: 'GDP 2.0% 내외',
      unemployment: '실업률 4.1% 내외',
    },
    beneficiary_stocks: [
      { name: '삼성전자', code: '005930', expected_upside: '+3~5%', action: '매수', benefit_reason: '물가 안정 → 금리 인하 기대 → IT 수혜' },
      { name: 'SK하이닉스', code: '000660', expected_upside: '+3~5%', action: '매수', benefit_reason: '반도체 업황 회복 + 통화정책 완화 기대' },
      { name: 'KB금융', code: '105560', expected_upside: '+2~4%', action: '관심', benefit_reason: '배당 매력 + 안정적 예대마진' },
    ],
    damage_stocks: [
      { name: '롯데케미칼', code: '011170', expected_downside: '-2~4%', action: '관망', damage_reason: '원자재 가격 변동성 + 수요 불확실성' },
    ],
    sector_map: [
      { sector: '반도체', impact: '수혜', reason: '금리 인하 기대 수혜' },
      { sector: '은행', impact: '수혜', reason: '고배당 매력 지속' },
      { sector: '화학', impact: '피해', reason: '원자재 가격 변동성' },
      { sector: '건설', impact: '중립', reason: '물가-금리 연계성 주시' },
      { sector: '에너지', impact: '중립', reason: '유가와 물가 연동' },
      { sector: '음식료', impact: '중립', reason: '내수 소비 안정적' },
      { sector: '자동차', impact: '중립', reason: '소비자 구매력 영향' },
    ],
    hedge_strategy: '물가 지표 발표 전후 변동성이 확대될 수 있으므로, 반도체·금융주 중심의 코어 포트폴리오를 유지하면서 금 ETF로 인플레이션 헤지 비중을 확대하시기 바랍니다.',
    watch_points: [
      '다음 CPI/PCE 발표 일정',
      '에너지·식품 가격 추이',
      '근원 CPI vs 헤드라인 CPI',
      '美 FOMC 금리 전망',
    ],
  };
}

function buildGDPAnalysis(headlines, dateStr, session) {
  return {
    summary: `GDP 성장률 지표가 발표되어 경기 흐름을 가늠할 수 있는 중요한 신호를 제공했습니다. ${headlines[0] || ''} 성장률 둔화 시 경기 방어주가, 성장률 개선 시 경기 민감주가 주목받습니다.`,
    macro_event: `GDP 성장률 발표 (${session} 분석)`,
    event_date: dateStr,
    event_type: 'economic_data',
    impact_rating: 'MEDIUM',
    key_data: {
      rate_decision: 'GDP 의존적',
      policy_stance: '경기 지표 확인',
      inflation_outlook: 'PCE 2.6%',
      gdp_outlook: 'GDP 1.5~2.5% 전망',
      unemployment: '실업률 4.0% 내외',
    },
    beneficiary_stocks: [
      { name: '삼성전자', code: '005930', expected_upside: '+3~5%', action: '매수', benefit_reason: '경기 회복 시 반도체 수요 증가' },
      { name: 'POSCO홀딩스', code: '005490', expected_upside: '+3~5%', action: '관심', benefit_reason: '경기 민감주, 인프라 투자 수혜' },
    ],
    damage_stocks: [],
    sector_map: [
      { sector: '반도체', impact: '수혜', reason: '경기 회복 민감도' },
      { sector: '철강/소재', impact: '수혜', reason: '인프라 투자 확대' },
      { sector: '은행', impact: '수혜', reason: '대출 수요 증가' },
      { sector: '음식료', impact: '중립', reason: '내수 방어적 성격' },
      { sector: '건설', impact: '중립', reason: '경기 여건에 민감' },
      { sector: '에너지', impact: '중립', reason: '원자재 수요 연동' },
      { sector: '자동차', impact: '중립', reason: '소비 경기와 연계' },
    ],
    hedge_strategy: 'GDP 발표 국면에서는 경기 민감주(반도체·철강) 비중을 확대하고, 경기 방어주(음식료·통신)로 분산 투자하는 전략이 유효합니다.',
    watch_points: [
      '분기별 GDP 속보치·확정치',
      '수출입 동향 (경상수지)',
      '소비자심리지수',
      '제조업 PMI',
      '고용 지표',
    ],
  };
}

function buildExportAnalysis(headlines, dateStr, session) {
  return {
    summary: `수출 지표가 발표되며 국내 경기의 핵심 축인 수출 동향에 대한 신호를 제공했습니다. ${headlines[0] || ''} 수출 증가 시 반도체·자동차·조선 등 주력 수출주에 긍정적입니다.`,
    macro_event: `수출·무역 지표 (${session} 분석)`,
    event_date: dateStr,
    event_type: 'economic_data',
    impact_rating: 'MEDIUM',
    key_data: {
      rate_decision: '수출 의존적',
      policy_stance: '수출 경쟁력 유지',
      inflation_outlook: '원자재 가격 영향',
      gdp_outlook: 'GDP 2.0% 내외',
      unemployment: '실업률 3.5% 내외',
    },
    beneficiary_stocks: [
      { name: '삼성전자', code: '005930', expected_upside: '+3~6%', action: '매수', benefit_reason: '반도체 수출 호조 지속' },
      { name: '현대차', code: '005380', expected_upside: '+3~5%', action: '매수', benefit_reason: '자동차 수출 실적 개선' },
      { name: 'HD현대중공업', code: '009540', expected_upside: '+4~7%', action: '관심', benefit_reason: '조선 수주 잔고 사상 최대' },
    ],
    damage_stocks: [],
    sector_map: [
      { sector: '반도체', impact: '수혜', reason: '수출 비중 20% 이상' },
      { sector: '자동차', impact: '수혜', reason: '수출 비중 70% 이상' },
      { sector: '조선', impact: '수혜', reason: '수주 잔고 증가' },
      { sector: '은행', impact: '중립', reason: '환율 간접 영향' },
      { sector: '음식료', impact: '중립', reason: '내수 중심' },
      { sector: '건설', impact: '중립', reason: '내수 경기 의존' },
      { sector: '에너지', impact: '중립', reason: '원유 수입 비용 영향' },
    ],
    hedge_strategy: '수출 호조 국면에서는 반도체·자동차·조선 등 주력 수출주 비중을 확대하고, 환율 상승(원화 약세)에 대비한 환헤지 전략을 병행하시기 바랍니다.',
    watch_points: [
      '월간 수출입 동향',
      '美·中 경기 지표',
      '반도체 수출 단가',
      '글로벌 공급망 동향',
    ],
  };
}

function buildGeopoliticsAnalysis(headlines, dateStr, session) {
  return {
    summary: `지정학적 리스크가 부각되며 시장 변동성이 확대되고 있습니다. ${headlines[0] || ''} 방산주·에너지주가 수혜를 받는 반면, 글로벌 공급망 의존도가 높은 섹터는 부담이 커집니다.`,
    macro_event: `지정학적 리스크 (${session} 분석)`,
    event_date: dateStr,
    event_type: 'geopolitics',
    impact_rating: 'HIGH',
    key_data: {
      rate_decision: '위험 회피',
      policy_stance: '안전자산 선호',
      inflation_outlook: '원자재 가격 상승 우려',
      gdp_outlook: 'GDP 1.8% 내외',
      unemployment: '실업률 3.5% 내외',
    },
    beneficiary_stocks: [
      { name: '한화에어로스페이스', code: '012450', expected_upside: '+10~15%', action: '매수', benefit_reason: '글로벌 방위비 증액 + K-방산 수출 호조' },
      { name: 'LIG넥스원', code: '079550', expected_upside: '+8~12%', action: '매수', benefit_reason: '유도무기 체계 수출 확대' },
      { name: 'S-Oil', code: '010950', expected_upside: '+5~8%', action: '관심', benefit_reason: '지정학 리스크 → 유가 상승 수혜' },
    ],
    damage_stocks: [
      { name: 'NAVER', code: '035420', expected_downside: '-5~8%', action: '비중축소', damage_reason: '광고 경기 위축 가능성' },
      { name: '현대차', code: '005380', expected_downside: '-3~5%', action: '관망', damage_reason: '글로벌 공급망 차질 우려' },
    ],
    sector_map: [
      { sector: '방산', impact: '수혜', reason: '국방비 증액 전망' },
      { sector: '에너지', impact: '수혜', reason: '유가 상승 수혜' },
      { sector: '금/원자재', impact: '수혜', reason: '안전자산 선호' },
      { sector: '항공/여행', impact: '피해', reason: '여행 수요 위축' },
      { sector: '건설', impact: '중립', reason: '해외 건설 수주 영향' },
      { sector: '음식료', impact: '중립', reason: '내수 방어주 부각' },
      { sector: '자동차', impact: '중립', reason: '공급망 영향 상쇄' },
    ],
    hedge_strategy: '지정학적 리스크 국면에서는 방산주·에너지주 비중을 확대하고 금 ETF를 통한 안전자산 편입을 권장합니다. 전체 포트폴리오의 변동성 완충을 위해 금 비중을 7~10%로 확대하시기 바랍니다.',
    watch_points: [
      '주요국 외교·군사 동향',
      '국제 유가 변동',
      '글로벌 방위비 예산 추이',
      '해상 운임(SCFI) 지수',
      '안전자산(금·달러) 가격',
    ],
  };
}

function buildOilAnalysis(headlines, dateStr, session) {
  return {
    summary: `국제 유가가 변동하며 에너지 섹터와 수송·화학 등 연관 업종에 파급효과를 미치고 있습니다. ${headlines[0] || ''} 유가 상승 시 에너지주 수혜, 유가 하락 시 항공·운송주 수혜가 예상됩니다.`,
    macro_event: `국제 유가 변동 (${session} 분석)`,
    event_date: dateStr,
    event_type: 'commodity',
    impact_rating: 'MEDIUM',
    key_data: {
      rate_decision: '유가 의존적',
      policy_stance: '에너지 가격 안정화',
      inflation_outlook: '에너지 가격 영향',
      gdp_outlook: 'GDP 2.0% 내외',
      unemployment: '실업률 3.5% 내외',
    },
    beneficiary_stocks: [
      { name: 'S-Oil', code: '010950', expected_upside: '+5~8%', action: '관심', benefit_reason: '유가 상승 → 정제마진 개선' },
      { name: 'SK이노베이션', code: '096770', expected_upside: '+3~6%', action: '관심', benefit_reason: '석유·배터리 이중 성장 동력' },
      { name: '대한항공', code: '003490', expected_upside: '+3~5%', action: '관심', benefit_reason: '유가 하락 시 연료비 감소' },
    ],
    damage_stocks: [
      { name: '대한항공', code: '003490', expected_downside: '-3~5%', action: '관망', damage_reason: '유가 상승 시 연료비 증가' },
      { name: '롯데케미칼', code: '011170', expected_downside: '-2~4%', action: '관망', damage_reason: '나프타 원료 가격 상승 부담' },
    ],
    sector_map: [
      { sector: '에너지', impact: '수혜', reason: '유가 상승 → 정제마진 개선' },
      { sector: '반도체', impact: '중립', reason: '간접 영향 제한적' },
      { sector: '항공', impact: '피해', reason: '유류비 부담 증가' },
      { sector: '화학', impact: '피해', reason: '원재료 가격 상승' },
      { sector: '자동차', impact: '중립', reason: '전기차 전환 가속' },
      { sector: '건설', impact: '중립', reason: '중동 건설 수주 영향' },
      { sector: '음식료', impact: '중립', reason: '물류비 간접 영향' },
    ],
    hedge_strategy: '유가 변동 국면에서는 에너지주와 항공·운송주를 균형 있게 편입하여 유가 방향성에 따른 리스크를 상쇄하시기 바랍니다. 원유 ETF로 직접 투자도 고려할 수 있습니다.',
    watch_points: [
      'WTI·브렌트유 가격 추이',
      'OPEC+ 감산 결정',
      '美 원유 재고',
      '중동 지정학 상황',
      '글로벌 수요 전망',
    ],
  };
}

function generateDefaultAnalysis(newsItems) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);
  const hour = today.getHours();
  const session = hour < 12 ? '오전' : '오후';
  const recentHeadlines = newsItems.slice(0, 8).map(item => item.title);

  return {
    summary: `현재 뚜렷한 단일 매크로 이벤트보다 복합적인 요인이 시장에 영향을 미치고 있습니다. 글로벌 경기 둔화 우려와 국내 수출 회복 기대가 교차하는 가운데, 종목별 차별화 장세가 예상됩니다. ${recentHeadlines[0] || ''}`,
    macro_event: `종합 매크로 분석 (${session} 분석)`,
    event_date: dateStr,
    event_type: 'mixed',
    impact_rating: 'MEDIUM',
    key_data: {
      rate_decision: '관망 (추가 변동 가능)',
      policy_stance: '데이터 의존적',
      inflation_outlook: '안정세',
      gdp_outlook: 'GDP 2.0% 내외',
      unemployment: '실업률 3.0% 내외',
    },
    beneficiary_stocks: [
      { name: '삼성전자', code: '005930', expected_upside: '+3~5%', action: '관심', benefit_reason: '반도체 업황 회복 + 글로벌 AI 수요 증가' },
      { name: 'SK하이닉스', code: '000660', expected_upside: '+3~5%', action: '관심', benefit_reason: 'HBM 수요 폭발 + AI 반도체 시장 확대' },
    ],
    damage_stocks: [
      { name: '현대건설', code: '000720', expected_downside: '-2~4%', action: '관망', damage_reason: '건설 경기 둔화 + PF 리스크' },
    ],
    sector_map: [
      { sector: '반도체', impact: '수혜', reason: 'AI 수요, 업황 회복' },
      { sector: '은행', impact: '수혜', reason: '안정적 예대마진' },
      { sector: '건설', impact: '피해', reason: 'PF 리스크, 수주 감소' },
      { sector: '바이오', impact: '중립', reason: 'R&D 모멘텀 개별적' },
      { sector: '에너지', impact: '중립', reason: '유가 변동성 주시' },
      { sector: '음식료', impact: '중립', reason: '내수 소비 안정적' },
      { sector: '자동차', impact: '중립', reason: '수출·환율 변수' },
    ],
    hedge_strategy: '복합적 매크로 환경에서는 섹터별 분산 투자가 중요합니다. 반도체·금융주 중심의 코어 포트폴리오에 배당주와 금 ETF를 혼합하여 변동성에 대비하시기 바랍니다.',
    watch_points: [
      '美 FOMC 향방',
      '국내 수출 지표',
      '외국인 수급 동향',
      '국제 유가 변동',
    ],
    generated_at: today.toISOString(),
    session,
    source: 'Google News RSS (한국 금융·증시)',
    news_headlines: recentHeadlines,
  };
}

// ── 메인 API ──
export async function getMacroAnalysis(forceRefresh = false) {
  const now = Date.now();

  // 캐시 유효하면 반환
  if (!forceRefresh && cachedAnalysis && (now - cacheTimestamp) < CACHE_TTL_MS) {
    console.log('[MacroNews] 캐시된 분석 반환 (생성:', new Date(cacheTimestamp).toISOString(), ')');
    return { ...cachedAnalysis, cached: true, cache_age_minutes: Math.floor((now - cacheTimestamp) / 60000) };
  }

  console.log('[MacroNews] 뉴스 수집 및 분석 시작...');
  const newsItems = await collectAllNews();
  console.log(`[MacroNews] ${newsItems.length}개 뉴스 수집 완료`);

  const detectedEvents = detectMacroEvents(newsItems);
  console.log('[MacroNews] 감지된 이벤트:', detectedEvents.ranked.slice(0, 3).map(([t, s]) => `${t}(${s})`).join(', '));

  const analysis = generateMacroAnalysis(newsItems, detectedEvents);

  // 캐시 업데이트
  cachedAnalysis = analysis;
  cacheTimestamp = now;

  return { ...analysis, cached: false };
}

// 캐시 무효화 (수동 갱신)
export function invalidateCache() {
  cachedAnalysis = null;
  cacheTimestamp = 0;
}

export { CACHE_TTL_MS };
