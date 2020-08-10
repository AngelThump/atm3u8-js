process.on('unhandledRejection', function(reason, p){
  console.log("Possibly Unhandled Rejection at: Promise ", p, " reason: ", reason);
});

const HLS = require('hls-parser');
const got = require('got');
const os = require("os");
const server = os.hostname();
const port = 8089;
const cors = ['https://angelthump.com', 'https://www.angelthump.com', 'https://player.angelthump.com', 'https://www.gstatic.com', 'https://gstatic.com', 'https://hls-js-dev.netlify.app'];
const express = require('express');
const app = express();
app.disable('x-powered-by');


app.get('/ping', (req, res) => {
  res.status(200).send('GOOD TO GO');
});

const getFile = async (url) => {
  let file;
  await got(`http://127.0.0.1:80${url}`)
  .then(response => {
    if(!response) {
      console.error(response);
      return;
    }
    if(!response.body) {
      console.error(response);
      return;
    }

    file = response.body;
  })
  .catch(e => {
    if(!e.response) {
      return console.error(e);
    }
    if(e.response.statusCode != 404) {
      console.error(e.response);
    }
    return;
  })
  return file;
}

app.get('/hls/:username/:file', async (req, res) => {
  let url = req.url;
  let stream = req.params.username;

  let file = await getFile(url);
  if(!file) {
    return res.status(404).send('no file');
  }
  file = await loadPlaylist(file, stream);
  if(!file) {
    return res.status(500).send('hls parsing error');
  }
  const origin = req.headers.origin;
  if(cors.indexOf(origin) > -1){
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  //res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/x-mpegURL');
  res.setHeader('Cache-Control', 'no-cache, no-store, private');
  res.send(file);
})

app.get('/hls/:username', async (req, res) => {
  const url = req.url;
  let stream = req.params.username;

  let file = await getFile(url);
  if(!file) {
    return res.status(404).send('no file');
  }
  file = await loadPlaylist(file, stream);
  if(!file) {
    return res.status(500).send('hls parsing error');
  }
  const origin = req.headers.origin;
  if(cors.indexOf(origin) > -1){
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  //res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/x-mpegURL');
  res.setHeader('Cache-Control', 'no-cache, no-store, private');
  res.send(file);
});

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