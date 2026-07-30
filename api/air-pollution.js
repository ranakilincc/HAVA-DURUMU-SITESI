const { proxyOwm } = require('./_lib/owm');

module.exports = async function handler(req, res) {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    res.status(400).json({ message: 'lat ve lon parametresi gerekli.' });
    return;
  }
  await proxyOwm(res, 'air_pollution', { lat, lon });
};
