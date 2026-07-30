const { getKv, getClientId } = require('./_lib/kv');

// Not: Bu uç Upstash Redis gerektirir (Vercel Marketplace > Storage > Upstash Redis).
// Bağlı değilse 500 döner; client bu durumda sessizce localStorage'a düşer.
module.exports = async function handler(req, res) {
  const clientId = getClientId(req, res);
  const key = `favorites:${clientId}`;

  try {
    const kv = getKv();

    if (req.method === 'GET') {
      const favorites = (await kv.get(key)) || [];
      res.status(200).json({ favorites });
      return;
    }

    if (req.method === 'POST' || req.method === 'DELETE') {
      const { city } = req.body || {};
      if (!city) {
        res.status(400).json({ message: 'city gerekli.' });
        return;
      }
      const favorites = (await kv.get(key)) || [];
      const exists = favorites.some((c) => c.toLowerCase() === city.toLowerCase());
      const shouldRemove = req.method === 'DELETE' || exists;
      const updated = shouldRemove
        ? favorites.filter((c) => c.toLowerCase() !== city.toLowerCase())
        : [city, ...favorites].slice(0, 20);
      await kv.set(key, updated);
      res.status(200).json({ favorites: updated });
      return;
    }

    res.status(405).json({ message: 'Desteklenmeyen metod.' });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası: Upstash Redis yapılandırılmamış olabilir.' });
  }
};
