process.on('unhandledRejection', function(reason, p){
  console.log("Possibly Unhandled Rejection at: Promise ", p, " reason: ", reason);
});

const HLS = require('hls-parser');
const os = require("os");
const server = os.hostname();
const port = 8089;
const cors = ['https://angelthump.com', 'https://www.angelthump.com', 'https://player.angelthump.com', 'https://www.gstatic.com', 'https://gstatic.com'];
const redis = require('redis');
const rstream = require('redis-rstream');
const redisClient = redis.createClient({return_buffers : true});
const express = require('express');
const app = express();
app.disable('x-powered-by');

redisClient.on('connect', function() {
  console.log('Redis client connected');
});

redisClient.on('error', (err) => {
  console.log("Redis Error " + err);
});

app.get('/ping', (req, res) => {
  res.status(200).send('GOOD TO GO');
});

const getCachedFile = () => {
  return async(req, res, next) => {
      let url = req.originalUrl;
      const key = url.substring(url.indexOf('/hls/') + 5, url.length);
      //console.log(key);

      res.header('Cache-Control', 'no-cache, no-store, private');
      res.header("Access-Control-Allow-Origin", "*");
      
      if(key.endsWith('m3u8')) {
        res.header('Content-Type', 'application/vnd.apple.mpegurl');
        redisClient.get(key, async function(err, data) {
          if(err) {
            res.status(404).send('no file');
            return console.error(err);
          }
          if(!data) {
            return res.status(404).send('no file');
          }

          const stream = key.substring(0, key.lastIndexOf('/'));
          const playlist = await loadPlaylist(data.toString(), stream);
          if(!playlist) {
            res.status(400).send('no m3u8');
          }
          res.send(playlist);
        })
      } else if (key.endsWith('mp4')) {
        res.header('Content-Type', 'video/mp4');
        redisClient.get(key, function(err, data) {
          if(err) {
            res.status(404).send('no file');
            return console.error(err);
          }
          if(!data) {
            return res.status(404).send('no file');
          }
          res.send(data);
        })
      } else if (key.endsWith('m4s')) {
        res.header('Content-Type', 'video/iso.segment');
        redisClient.exists(key, (err, data) => {
          if(err) console.error(err)
          if(!data) {
            return res.status(404).send('no file');
          }
          rstream(redisClient, key).pipe(res);
        })
      } else if (key.endsWith('ts')) {
        res.header('Content-Type', 'video/mp2t');
        redisClient.exists(key, (err, data) => {
          if(err) console.error(err)
          if(!data) {
            return res.status(404).send('no file');
          }
          rstream(redisClient, key).pipe(res);
        })
      } else {
        res.send('?');
      }
  }
}

const getCachedMaster = () => {
  return async(req, res, next) => {
      let url = req.originalUrl;
      const key = url.substring(url.indexOf('/hls/') + 5, url.length);
      //console.log(key);

      res.header('Cache-Control', 'no-cache, no-store, private');
      res.header("Access-Control-Allow-Origin", "*");
      
      if(key.endsWith('m3u8')) {
        res.header('Content-Type', 'application/vnd.apple.mpegurl');
        redisClient.get(key, async function(err, data) {
          if(err) {
            res.status(404).send('no file');
            return console.error(err);
          }
          if(!data) {
            return res.status(404).send('no file');
          }

          const stream = key.substring(0, key.lastIndexOf('.m3u8'));
          const playlist = await loadPlaylist(data.toString(), stream);
          if(!playlist) {
            res.status(400).send('no m3u8');
          }
          res.send(playlist);
        })
      } else {
        res.send('?');
      }
  }
}

app.get('/hls/:username', getCachedMaster(app));
app.get('/hls/:username/:endUrl', getCachedFile(app));

app.listen(port, () => console.log(`atm3u8-js listening on port ${port}!`))

const loadPlaylist = async (m3u8, stream) => {
  let playlist = HLS.parse(m3u8);
  if(!playlist) return null;
  if (playlist.isMasterPlaylist) {
    for(let i = 0; i<playlist.variants.length; i++) {
      const region = server.substring(0,3);
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