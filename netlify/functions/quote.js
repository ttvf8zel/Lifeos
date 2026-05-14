const https = require('https');

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      // Follow redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location, headers).then(resolve).catch(reject);
      }
      res.on('data', c => data += c);
      res.on('end', () => resolve({ body: data, headers: res.headers, status: res.statusCode }));
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

async function getYahooCrumb() {
  // Step 1: get cookies from Yahoo Finance main page
  const cookieRes = await httpsGet('https://finance.yahoo.com/', {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  });
  
  const cookies = cookieRes.headers['set-cookie'] || [];
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');

  // Step 2: get crumb
  const crumbRes = await httpsGet('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Cookie': cookieStr,
    'Accept': 'text/plain',
  });

  return { crumb: crumbRes.body.trim(), cookieStr };
}

exports.handler = async (event) => {
  const ticker = (event.queryStringParameters || {}).ticker;
  if (!ticker) return { statusCode: 400, body: 'Missing ticker' };

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const { crumb, cookieStr } = await getYahooCrumb();
    
    const encoded = encodeURIComponent(ticker);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5d&crumb=${encodeURIComponent(crumb)}`;
    
    const res = await httpsGet(url, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': cookieStr,
      'Accept': 'application/json',
    });

    const data = JSON.parse(res.body);
    const meta = data?.chart?.result?.[0]?.meta;

    if (meta && meta.regularMarketPrice > 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          c: meta.regularMarketPrice,
          pc: meta.chartPreviousClose || meta.previousClose || 0,
          currency: meta.currency || '',
        }),
      };
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'No price found for ' + ticker }),
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
