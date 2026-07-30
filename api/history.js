const { getKv, getClientId } = require('./_lib/kv');

const HISTORY_MAX = 5;

// Not: Bu uç Upstash Redis gerektirir (Vercel Marketplace > Storage > Upstash Redis).
// Bağlı değilse 500 döner; client bu durumda sessizce localStorage'a düşer.
module.exports = async function handler(req, res) {
  const clientId = getClientId(req, res);
  const key = `history:${clientId}`;

  try {
    const kv = getKv();

    if (req.method === 'GET') {
      const history = (await kv.get(key)) || [];
      res.status(200).json({ history });
      return;
    }

    if (req.method === 'POST') {
      const { city } = req.body || {};
      if (!city) {
        res.status(400).json({ message: 'city gerekli.' });
        return;
      }
      let history = (await kv.get(key)) || [];
      history = history.filter((c) => c.toLowerCase() !== city.toLowerCase());
      history.unshift(city);
      history = history.slice(0, HISTORY_MAX);
      await kv.set(key, history);
      res.status(200).json({ history });
      return;
    }

    res.status(405).json({ message: 'Desteklenmeyen metod.' });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası: Upstash Redis yapılandırılmamış olabilir.' });
  }
};
