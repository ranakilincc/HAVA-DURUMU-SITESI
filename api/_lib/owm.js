const OWM_BASE = 'https://api.openweathermap.org/data/2.5';

function buildUrl(path, params) {
  const key = process.env.OWM_API_KEY;
  if (!key) throw new Error('OWM_API_KEY ortam değişkeni tanımlı değil. Vercel proje ayarlarından (Environment Variables) ekleyin.');
  const qs = new URLSearchParams({ ...params, appid: key });
  return `${OWM_BASE}/${path}?${qs.toString()}`;
}

// OpenWeatherMap isteğini API anahtarı gizli kalacak şekilde sunucu tarafında yapar,
// yanıtı olduğu gibi client'a döner ve kısa süreli edge cache uygular.
async function proxyOwm(res, path, params) {
  try {
    const url = buildUrl(path, params);
    const owmRes = await fetch(url);
    const data = await owmRes.json();

    if (!owmRes.ok) {
      res.status(owmRes.status).json(data);
      return;
    }

    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=300');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Sunucu hatası.' });
  }
}

module.exports = { proxyOwm };
