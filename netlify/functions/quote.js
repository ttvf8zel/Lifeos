const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

exports.handler = async (event) => {
  const ticker = (event.queryStringParameters || {}).ticker;
  if (!ticker) return { statusCode: 400, body: 'Missing ticker' };

  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  const path = `/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;

  for (const host of hosts) {
    try {
      const data = await get(`https://${host}${path}`);
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta && meta.regularMarketPrice > 0) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            c: meta.regularMarketPrice,
            pc: meta.chartPreviousClose || meta.previousClose || 0,
            currency: meta.currency || ''
          })
        };
      }
    } catch(e) {}
  }

  return {
    statusCode: 404,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ error: 'Not found: ' + ticker })
  };
};
