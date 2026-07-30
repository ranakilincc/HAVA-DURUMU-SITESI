const { proxyOwm } = require('./_lib/owm');

// Not: /uvi ucu OpenWeatherMap tarafında deprecated — bazı hesaplarda 4xx dönebilir.
// Client tarafı bu durumu zaten "N/A" göstererek sessizce yönetiyor.
module.exports = async function handler(req, res) {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    res.status(400).json({ message: 'lat ve lon parametresi gerekli.' });
    return;
  }
  await proxyOwm(res, 'uvi', { lat, lon });
};
