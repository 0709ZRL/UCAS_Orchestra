const express = require('express');
const router = express.Router();

/**
 * GET /api/geocode/search?q=地名
 * 使用 Nominatim (OpenStreetMap) 进行地名搜索，返回经纬度
 * 设计上可替换为高德/百度地图 API
 */
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ success: false, message: '请提供搜索关键词' });
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=8&accept-language=zh`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'OrchestraManagement/1.0' }
    });
    const data = await response.json();

    const results = data.map(item => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type
    }));

    res.json({ success: true, data: results });
  } catch (err) {
    // 如果 Nominatim 失败，返回空结果而非报错
    res.json({ success: true, data: [] });
  }
});

module.exports = router;
