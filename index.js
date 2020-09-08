const HLS = require('hls-parser');
const os = require("os");
const server = os.hostname();
const region = server.substring(0, 3);
const config = require('./config.json');
const redis = require('redis');
const m3u8RedisClient = redis.createClient({host: config.redis[region], detect_buffers: true, password: config.redis.password});
const port = config.port;
const Readable = require('stream').Readable
const express = require('express');
const app = express();
const zlib = require('zlib');
app.set('etag', false);
app.disable('x-powered-by');
app.listen(port, () => console.log(`${region} atm3u8-js listening on port ${port}!`));

m3u8RedisClient.on('connect', function() {
  console.log('M3u8 Redis client connected');
});

m3u8RedisClient.on('error', (err) => {
  console.log("M3u8 Redis Error " + err);
});

app.get('/ping', (req, res) => {
  res.status(200).send('GOOD TO GO');
});

app.get('/hls/:stream/:file', async (req, res) => {
  const stream = req.params.stream;
  const key = stream + '/' + req.params.file;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, private');
  
  m3u8RedisClient.get(key, async (error, data) => {
    if(error) {
      res.status(500).send('redis error');
      return console.error(error);
    }
    if(!data) return res.status(400).send('no m3u8');

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');

    const m3u8 = await loadPlaylist(data, stream);
    const gzip = zlib.createGzip();

    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');

    Readable.from(m3u8).pipe(gzip).pipe(res);
  });
})

app.get('/hls/:stream\.m3u8', (req, res) => {
  const stream = req.params.stream;
  const key = `${stream}.m3u8`;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, private');
  
  m3u8RedisClient.get(key, async (error, data) => {
    if(error) {
      res.status(500).send('redis error');
      return console.error(error);
    }
    if(!data) return res.status(400).send('no m3u8');

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');

    const m3u8 = await loadPlaylist(data, stream);
    const gzip = zlib.createGzip();

    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');

    Readable.from(m3u8).pipe(gzip).pipe(res);
  });
});

const loadPlaylist = async (m3u8, stream) => {
  let playlist = HLS.parse(m3u8);
  if (playlist.isMasterPlaylist) {
    for(let i = 0; i<playlist.variants.length; i++) {
      if(!playlist.variants[i].codecs) {
        //ffmpeg not producing codec for source. no idea why. bandage for now.
        playlist.variants[i].codecs = 'avc1.42c01f,mp4a.40.2';
      }
      playlist.variants[i].uri = `https://${region}-haproxy.angelthump.com/hls/` + playlist.variants[i].uri;
    }
  } else {
    for(let i = 0; i<playlist.segments.length; i++) {
      playlist.segments[i].uri = `https://${server}.angelthump.com/hls/${stream}/` + playlist.segments[i].uri;
    }
  }
  return HLS.stringify(playlist);
}