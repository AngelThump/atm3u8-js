const HLS = require('hls-parser');
const axios = require('axios');
const os = require("os");
const server = os.hostname();
const port = 8089;
const cors = ['https://angelthump.com', 'https://www.angelthump.com', 'https://player.angelthump.com', 'https://www.gstatic.com', 'https://gstatic.com'];
const redis = require('redis');
const redisClient = redis.createClient();
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

const getFile = async (url) => {
  const file;
  await axios({
    method: "GET",
    url: `http://127.0.0.1:8081/${url}`
  })
  .then(response => {
    if(!response.data) {
      console.error(response.data);
      return;
    }

    file = response.data;
  })
  .catch(e => {
    if(e.response.statusCode != 404) {
      console.error(e.response);
    }
    return;
  })
}

app.get('/hls/:username/:file', async (req, res) => {
  let url = req.url;
  let stream = req.params.username;
  const key = url.substring(url.indexOf('/hls/') + 5, url.length);

  if(!key.endsWith('.m3u8')) {
    res.status(401).send('only m3u8s');
  }

  redisClient.get(key, function(err, data) {
    if(err) {
      res.status(404).send('redis error getting file');
      return console.error(err);
    }
    /*
    const origin = req.headers.origin;
    if(cors.indexOf(origin) > -1){
      //res.setHeader('Access-Control-Allow-Origin', origin);
    }*/
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/x-mpegURL');
    res.setHeader('Cache-Control', 'no-cache, no-store, private');
    if(!data) {
      const file = await getFile(url);
      if(!file) {
        return res.status(404).send('no file');
      }
      file = await loadPlaylist(file, stream);
      res.send(file);
      
      redisClient.set(key, file, 'PX', 500);
    }
    res.setHeader('X-Cached-Playlist', 'YES');
    res.send(data);
  })
})

app.get('/hls/:username', async (req, res) => {
  const url = req.url;
  let stream = req.params.username;
  const key = stream;
  stream = stream.substring(0,stream.indexOf('.m3u8'));

  redisClient.get(key, function(err, data) {
    if(err) {
      res.status(404).send('redis error getting file');
      return console.error(err);
    }
    /*
    const origin = req.headers.origin;
    if(cors.indexOf(origin) > -1){
      //res.setHeader('Access-Control-Allow-Origin', origin);
    }*/
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/x-mpegURL');
    res.setHeader('Cache-Control', 'no-cache, no-store, private');
    if(!data) {
      const file = await getFile(url);
      if(!file) {
        return res.status(404).send('no file');
      }
      file = await loadPlaylist(file, stream);
      res.send(file);
      
      redisClient.set(key, file, 'PX', 10000);
    }
    res.setHeader('X-Cached-Playlist', 'YES');
    res.send(data);
  })
});

app.listen(port, () => console.log(`atm3u8-js listening on port ${port}!`))

const loadPlaylist = async (m3u8, stream) => {
  let playlist = HLS.parse(m3u8);
  if(!playlist) return null;
  if (playlist.isMasterPlaylist) {
    for(let i = 0; i<playlist.variants.length; i++) {
      const region = server.substring(0,3);
      //overpowered_src/index.m3u8
      /*
      if(playlist.variants[i].uri.includes('_src')) {
        playlist.variants[i].uri = `https://${region}-haproxy.angelthump.com/hls/${stream}/index.m3u8`;
      } else {
        playlist.variants[i].uri = `https://${region}-haproxy.angelthump.com/hls/` + playlist.variants[i].uri;
      }*/
      playlist.variants[i].uri = `https://${region}-haproxy.angelthump.com/hls` + playlist.variants[i].uri;
    }
  } else {
    for(let i = 0; i<playlist.segments.length; i++) {
      playlist.segments[i].uri = `https://${server}.angelthump.com/hls/${stream}/` + playlist.segments[i].uri;
    }
  }
  return HLS.stringify(playlist);
}