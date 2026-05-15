const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5555;
const NCT_BASE_URL = process.env.NCT_BASE_URL || 'https://graph.nhaccuatui.com';
const SEARCH_PAGE_SIZE = Number(process.env.NCT_SEARCH_PAGE_SIZE || 10);

const nctClient = axios.create({
  baseURL: NCT_BASE_URL,
  timeout: Number(process.env.NCT_TIMEOUT_MS || 15000),
  headers: {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Origin: 'https://www.nhaccuatui.com',
    Referer: 'https://www.nhaccuatui.com/',
  },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeThumbnail(song) {
  return (
    toText(song?.thumbnail) ||
    toText(song?.image) ||
    toText(song?.coverImage) ||
    toText(song?.avatar)
  );
}

function pickStream(detail) {
  const streams = Array.isArray(detail?.streamURL) ? detail.streamURL : [];
  const usable = streams.filter((item) => {
    const stream = toText(item?.stream);
    return stream && /^https?:\/\//i.test(stream) && item?.status !== 0 && !item?.onlyVIP;
  });

  const preferred =
    usable.find((item) => String(item?.type) === '128') ||
    usable.find((item) => String(item?.type) === '320') ||
    usable[0];

  if (preferred) {
    return {
      streamUrl: preferred.stream,
      quality: String(preferred.type || preferred.typeUI || ''),
    };
  }

  const fallback = streams.find((item) => /^https?:\/\//i.test(toText(item?.stream)));
  if (!fallback) {
    return null;
  }

  return {
    streamUrl: fallback.stream,
    quality: String(fallback.type || fallback.typeUI || ''),
  };
}

function normalizeSong(candidate, detail, stream) {
  const source = detail || candidate || {};
  return {
    title: toText(source.name) || toText(source.title) || toText(candidate?.name),
    artist:
      toText(source.artistName) ||
      toText(source.artistsNames) ||
      toText(candidate?.artistName) ||
      toText(candidate?.artistsNames),
    duration: toNumber(source.duration || candidate?.duration),
    thumbnail: normalizeThumbnail(source) || normalizeThumbnail(candidate),
    streamUrl: stream.streamUrl,
  };
}

async function searchSongs(keyword) {
  const searchResponse = await nctClient.post('/api/v1/search/song', null, {
    params: {
      keyword,
      pageindex: 1,
      pagesize: SEARCH_PAGE_SIZE,
      correct: false,
    },
  });

  const candidates = Array.isArray(searchResponse.data?.data?.songs)
    ? searchResponse.data.data.songs
    : [];
  const songs = [];

  for (const candidate of candidates) {
    const key = toText(candidate?.key);
    if (!key) {
      continue;
    }

    try {
      const detailResponse = await nctClient.get(`/api/v1/song/detail/${encodeURIComponent(key)}`);
      const detail = detailResponse.data?.data || {};
      const stream = pickStream(detail) || pickStream(candidate);

      if (!stream?.streamUrl) {
        console.warn(`[NCT] No direct streamUrl, fallback to next song: ${candidate.name || key}`);
        continue;
      }

      songs.push(normalizeSong(candidate, detail, stream));
    } catch (error) {
      const stream = pickStream(candidate);
      if (stream?.streamUrl) {
        songs.push(normalizeSong(candidate, candidate, stream));
      } else {
        console.warn(
          `[NCT] Detail failed and candidate has no streamUrl, fallback to next song: ${candidate.name || key}: ${error.message}`
        );
      }
    }
  }

  return songs;
}

app.get('/health', (req, res) => {
  res.json({ ok: true, source: 'nhaccuatui' });
});

app.get('/api/search', async (req, res) => {
  const keyword = toText(req.query.q);
  if (!keyword) {
    return res.status(400).json({ error: 'Missing query parameter: q' });
  }

  try {
    const songs = await searchSongs(keyword);
    res.json({
      source: 'nhaccuatui',
      query: keyword,
      total: songs.length,
      songs,
    });
  } catch (error) {
    console.error('[NCT] Search failed:', error.response?.data || error.message);
    res.status(502).json({
      error: 'NhacCuaTui search failed',
      detail: error.message,
    });
  }
});

app.get('/api/song/stream', (req, res) => {
  const streamUrl = toText(req.query.url || req.query.streamUrl);
  if (!streamUrl || !/^https?:\/\//i.test(streamUrl)) {
    return res.status(400).json({
      error: 'This NhacCuaTui version does not use encodeId. Provide ?url=<streamUrl>.',
    });
  }

  res.redirect(streamUrl);
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`NhacCuaTui mp3-api listening on port ${PORT}`);
});
