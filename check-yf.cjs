const yf = require('yahoo-finance2');
console.log('Type:', typeof yf);
console.log('Keys:', Object.keys(yf));
console.log('default type:', typeof yf.default);
if (typeof yf.default === 'function') {
  console.log('default is function');
} else if (typeof yf.default === 'object') {
  console.log('default keys:', Object.keys(yf.default));
}
