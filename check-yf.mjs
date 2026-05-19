import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance();

try {
  const quotes = await yf.quote(['005930.KS','000660.KS','035420.KQ','012450.KS','024110.KS']);
  console.log('=== Yahoo Finance v3 - Korean Stock Prices ===\n');
  quotes.forEach(q => {
    const symbol = (q.symbol || '?').padEnd(14);
    const name = (q.longName || q.shortName || 'N/A').substring(0, 22).padEnd(22);
    const price = String(q.regularMarketPrice || 'N/A').padStart(12);
    const change = q.regularMarketChangePercent != null
      ? ((q.regularMarketChangePercent >= 0 ? '+' : '') + q.regularMarketChangePercent.toFixed(2) + '%').padStart(10)
      : '       N/A';
    console.log(`${symbol} | ${name} | ${price} ${q.currency || 'KRW'} | ${change}`);
  });
  console.log('\n=== Metrics ===\n');
  quotes.forEach(q => {
    const name = (q.longName || q.shortName || 'N/A').substring(0, 22).padEnd(22);
    console.log(`${name} PER:${q.trailingPE || 'N/A'} PBR:${q.priceToBook || 'N/A'} Div:${q.dividendYield != null ? (q.dividendYield * 100).toFixed(2) + '%' : 'N/A'}`);
  });
  console.log('\n✅ yahoo-finance2 v3 WORKS for Korean stocks!');
} catch(e) {
  console.error('❌', e.message);
}
