const express = require('express');
const path = require('path');
const { ZingMp3 } = require('./dist');

const app = express();
const PORT = process.env.PORT || 5555;
const STREAM_QUALITY_FALLBACKS = ['128', '320', 'lossless', 'hls'];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function isValidStreamUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value) && value.toUpperCase() !== 'VIP';
}

function findFirstStreamUrl(value, pathParts = []) {
  if (isValidStreamUrl(value)) {
    return { url: value, quality: pathParts.join('.') || 'url' };
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findFirstStreamUrl(value[i], [...pathParts, String(i)]);
      if (found) return found;
    }
    return null;
  }

  for (const key of Object.keys(value)) {
    const found = findFirstStreamUrl(value[key], [...pathParts, key]);
    if (found) return found;
  }

  return null;
}

function pickStreamUrl(source) {
  if (!source || typeof source !== 'object') {
    return null;
  }

  for (const quality of STREAM_QUALITY_FALLBACKS) {
    const value = source[quality];
    if (isValidStreamUrl(value)) {
      return { url: value, quality };
    }

    if (quality === 'hls' && value && typeof value === 'object') {
      const found = findFirstStreamUrl(value, [quality]);
      if (found) return found;
    }
  }

  return findFirstStreamUrl(source);
}

function logZingStreamResponse(id, response) {
  const data = response?.data;
  console.log('[song/stream] ZingMP3 raw response', JSON.stringify({
    id,
    err: response?.err,
    msg: response?.msg,
    timestamp: response?.timestamp,
    available_keys: data && typeof data === 'object' ? Object.keys(data) : [],
    data,
  }, null, 2));
}

function getZingErrorPayload(error, fallbackMessage = 'Internal Error') {
  const zingData = error?.response?.data;
  return {
    error: error?.message || fallbackMessage,
    zing_msg: zingData?.msg || zingData?.message || zingData?.error || null,
    available_keys: zingData?.data && typeof zingData.data === 'object' ? Object.keys(zingData.data) : [],
  };
}

// health
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// basic demos
app.get('/api/top100', async (_req, res) => {
  try {
    const data = await ZingMp3.getTop100();
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/home', async (_req, res) => {
  try {
    const data = await ZingMp3.getHome();
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

// full list according to README
app.get('/api/song', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getSong(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

// redirect to stream URL for simple playback (avoid CORS)
app.get('/api/song/stream', async (req, res) => {
  try {
    const { id, json } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const songId = String(id);
    const response = await ZingMp3.getSong(songId);
    logZingStreamResponse(songId, response);

    const source = response?.data;
    const availableKeys = source && typeof source === 'object' ? Object.keys(source) : [];
    const picked = pickStreamUrl(source);
    if (!picked) {
      return res.status(404).json({
        error: 'Stream URL not found',
        zing_msg: response?.msg || null,
        available_keys: availableKeys,
      });
    }

    if (json === '1') {
      return res.json({
        stream_url: picked.url,
        quality: picked.quality,
        id: songId,
      });
    }

    return res.redirect(picked.url);
  } catch (e) {
    console.error('[song/stream] ZingMP3 request failed', e?.response?.data || e);
    res.status(e?.response?.status || 500).json(getZingErrorPayload(e));
  }
});

app.get('/api/detail-playlist', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getDetailPlaylist(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/chart-home', async (_req, res) => {
  try {
    const data = await ZingMp3.getChartHome();
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/newrelease-chart', async (_req, res) => {
  try {
    const data = await ZingMp3.getNewReleaseChart();
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/info-song', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getInfoSong(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/artist', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    const data = await ZingMp3.getArtist(String(name));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/artist-songs', async (req, res) => {
  try {
    const { id, page = '1', count = '15' } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getListArtistSong(String(id), String(page), String(count));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/lyric', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getLyric(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing q' });
    const data = await ZingMp3.search(String(q));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/list-mv', async (req, res) => {
  try {
    const { id, page = '1', count = '15' } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getListMV(String(id), String(page), String(count));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/category-mv', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getCategoryMV(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/video', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getVideo(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
