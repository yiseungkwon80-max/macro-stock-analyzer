import yahooFinance from 'yahoo-finance2';

const symbols = ['005930.KS', '000660.KS', '105560.KS'];

try {
  const results = await yahooFinance.quote(symbols, {
    fields: [
      'regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent',
      'longName', 'shortName', 'currency', 'marketState',
      'trailingPE', 'forwardPE', 'priceToBook',
      'marketCap', 'regularMarketVolume',
      'fiftyTwoWeekHigh', 'fiftyTwoWeekLow',
      'epsTrailingTwelveMonths', 'epsForward',
      'dividendYield', 'bookValue', 'priceToSales',
    ]
  });

  const items = Array.isArray(results) ? results : [results];
  items.forEach(q => {
    console.log('---');
    console.log('Name:', q.longName || q.shortName, '(' + q.symbol + ')');
    console.log('Price:', q.regularMarketPrice, q.currency);
    console.log('Change:', q.regularMarketChange, '(' + (q.regularMarketChangePercent || 0).toFixed(2) + '%)');
    console.log('PER:', q.trailingPE, '| PBR:', q.priceToBook, '| PSR:', q.priceToSales);
    console.log('EPS:', q.epsTrailingTwelveMonths, '| FWD_EPS:', q.epsForward);
    console.log('MarketCap:', q.marketCap);
    console.log('DivYield:', q.dividendYield);
    console.log('Volume:', q.regularMarketVolume);
    console.log('52Wk H/L:', q.fiftyTwoWeekHigh, '/', q.fiftyTwoWeekLow);
    console.log('BookValue:', q.bookValue);
  });

  console.log('');
  console.log('SUCCESS - yahoo-finance2 works!');
} catch (err) {
  console.error('ERROR:', err.message);
}
