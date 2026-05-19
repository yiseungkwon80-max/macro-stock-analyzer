import yahooFinance from 'yahoo-finance2';

async function test() {
  try {
    const quotes = await yahooFinance.quote(['005930.KS','000660.KS','035420.KQ','012450.KS','024110.KS']);
    console.log('=== Korean Stock Real-time Price Test (Yahoo Finance) ===');
    console.log('');
    quotes.forEach((q) => {
      var name = (q.longName || q.shortName || 'N/A').substring(0, 22).padEnd(22);
      var price = String(q.regularMarketPrice || 'N/A').padStart(12);
      var changePct = q.regularMarketChangePercent;
      var change = changePct != null ? ((changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%').padStart(10) : '       N/A';
      console.log(q.symbol + ' | ' + name + ' | ' + price + ' ' + (q.currency || 'KRW') + ' | ' + change);
    });
    console.log('');
    console.log('=== Additional Metrics (PER, PBR, Dividend) ===');
    console.log('');
    quotes.forEach((q) => {
      var name = (q.longName || q.shortName || 'N/A').substring(0, 22).padEnd(22);
      console.log(name + ' PER:' + (q.trailingPE || 'N/A') + ' PBR:' + (q.priceToBook || 'N/A') + ' Div:' + (q.dividendYield != null ? (q.dividendYield * 100).toFixed(2) + '%' : 'N/A'));
    });
    console.log('');
    console.log('SUCCESS: yahoo-finance2 works for Korean stocks!');
  } catch(e) {
    console.error('ERROR:', e.message);
  }
}

test();
