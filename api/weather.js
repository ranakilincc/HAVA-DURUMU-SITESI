const { proxyOwm } = require('./_lib/owm');

module.exports = async function handler(req, res) {
  const { city, lat, lon } = req.query;
  const params = { units: 'metric', lang: 'tr' };

  if (city) {
    params.q = city;
  } else if (lat && lon) {
    params.lat = lat;
    params.lon = lon;
  } else {
    res.status(400).json({ message: 'city ya da lat/lon parametresi gerekli.' });
    return;
  }

  await proxyOwm(res, 'weather', params);
};
