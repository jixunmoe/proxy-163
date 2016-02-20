/* jshint esversion:6, node:true */
'use strict';
var http = require('http');
var url  = require('url');
var util = require('./util');

const PORT = 4003;

// From: http://youmightnotneedjquery.com/
var deepExtend = function(out) {
  out = out || {};

  for (var i = 1; i < arguments.length; i++) {
    var obj = arguments[i];

    if (!obj)
      continue;

    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (typeof obj[key] === 'object')
          out[key] = deepExtend(out[key], obj[key]);
        else
          out[key] = obj[key];
      }
    }
  }

  return out;
};

const _PROXY_IMAGE = 1;
const _PROXY_CHINA = 2;
var cache = {};

// We need a function which handles requests and send response
function handleRequest(request, response){
  var url_parts = url.parse(request.url);
  if (null === url_parts.hostname) {
    console.info(url_parts.path);
    request.url = 'http:/' + url_parts.path;
    url_parts = url.parse(request.url);
  }

  if (!url_parts.path || !url_parts.host || url_parts.host == 'favicon.ico') {
    response.writeHead(404);
    response.end();
    return ;
  }

  console.info('[*] Proxy url %s', request.url);

  // If is not 126 domain, just use proxy.
  if (request.url.indexOf('.music.126.net') == -1) {
    handleChinaProxy(url_parts, request, response);
    return ;
  }

  switch (cache[request.url]) {
    case _PROXY_IMAGE:
    default:
      handleImageDomain(url_parts, request, response);
      break;

    case _PROXY_CHINA:
      handleChinaProxy(url_parts, request, response);
      break;
  }
}

function handleChinaProxy (url_parts, request, response, count) {
  var opts = util.getProxy();
  var headers = deepExtend({}, request.headers);

  headers.hostname = url_parts.hostname;
  headers.host = url_parts.hostname;
  
  deepExtend(opts, {
    method: 'GET',
    path: url_parts.path,
    headers: headers
  });

  console.info('[*] Proxy via %s:%d', opts.hostname, opts.port);
  var req = http.request(opts, proxyResponse(response, false, {'x-proxy-via': opts.hostname + ':' + opts.port}));
  function onError () {
    if (count === undefined) {
      count = 3;
    }

    if (count-- === 0) {
      response.end();
    } else {
      console.info('[!] Proxy hang up, try another one.');
      handleChinaProxy(url_parts, request, response, count);
    }
  }
  req.on('error', onError);
  req.setTimeout(15000, onError);
  req.end();
}

function handleImageDomain(url_parts, request, response) {
  if (url_parts.hostname[0] != 'm') {
    // ip as domain
    var parts = url_parts.path.slice(1).split('/');
    url_parts.host = url_parts.hostname = parts.shift();
    url_parts.path = url_parts.pathname = '/' + parts.join('/');
    request.url = url.format(url_parts);
    console.info('[*] rebuild url: %s', request.url);
  }


  var host = url_parts.hostname.replace('m', 'p');
  var headers = deepExtend({}, request.headers);
  var opts = {
    hostname: host,
    method: 'GET',
    path: url_parts.path,
    headers: headers
  };

  if (headers.hostname) delete headers.hostname;
  if (headers.host) delete headers.host;

  var req = http.request(opts, (res) => {
    if (~~(res.statusCode / 10) != 20) {
      res.on('data', () => {});
      res.on('end',  () => {});
      handleImageDomainError() ;
      return ;
    }

    console.info('[*] p* domain works, proxy data though.');
    proxyResponse(response, true, {'x-proxy-via': host})(res);
  });
  req.on('error', handleImageDomainError);
  req.end();

  function handleImageDomainError () {
    // We need to proxy this file, and stop poking.
    console.info('[*] p* domain does not work, try proxy..');
    cache[request.url] = _PROXY_CHINA;
    handleChinaProxy (url_parts, request, response);
  }
}

function proxyResponse(response, bFixHeader, otherHeaders) {
  var stack = new Error();
  if (!response) {
    throw stack;
  }
  return (res) => {
    // 1 year cache, sounds good?
    res.headers['Cache-Control'] = 'max-age=31556926';

    if (bFixHeader)
      res.headers['Content-Type'] = 'audio/mpeg';

    try {
      response.setHeader('x-test', 'jixun');
    } catch (e) {
      throw stack;
    }
    for (let key in res.headers) {
      response.setHeader(key, res.headers[key]);
    }
    if (otherHeaders) {
      for (let key in otherHeaders) {
        response.setHeader(key, otherHeaders[key]);
      }
    }
    response.writeHead(res.statusCode);
    
    res.on('data', (chunk) => {
      response.write(chunk);
      // console.info('[*] Proxied %d bytes.', chunk.length);
    });
    res.on('end', () => {
      response.end();
    });
  };
}

//Create a server
var server = http.createServer(handleRequest);

//Lets start our server
server.listen(PORT, function(){
  //Callback triggered when server is successfully listening. Hurray!
  console.log("[*] Proxy started at port %d", PORT);
});