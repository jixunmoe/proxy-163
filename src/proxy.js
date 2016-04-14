/* jshint esversion:6, node:true */
'use strict';
var http = require('http');
var url  = require('url');
var debug = require('debug');
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
var _debug_handleRequest = debug('n:handleRequest');
var _debug_handleRequestV = debug('v:handleRequest');
function handleRequest(request, response){
  _debug_handleRequestV('enter');
  var url_parts = url.parse(request.url);
  if (null === url_parts.hostname) {
    _debug_handleRequest(url_parts.path);
    request.url = 'http:/' + url_parts.path;
    url_parts = url.parse(request.url);
  }

  if (!url_parts.path || !url_parts.host || url_parts.host == 'favicon.ico') {
    response.writeHead(404);
    _debug_handleRequestV('end response.');
    response.end();
    return ;
  }

  if (url_parts.host == 'music.163.com') {
    _debug_handleRequest('direct access %s', request.url);
    handlePassThrough (url_parts, request, response);
    return ;
  }

  _debug_handleRequest('Proxy url %s', request.url);

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

var _debug_handleErrorOnce = debug('n:handleErrorOnce');
var _debug_handleErrorOnceV = debug('v:handleErrorOnce');
function handleErrorOnce (req, onError) {
  _debug_handleErrorOnceV('enter');
  var counter = 1;
  function OnError () {
    if (counter) {
      counter--;
      return onError.apply(this, arguments);
    }
  }

  req.setTimeout(3500, OnError);
  req.on('error', OnError);
}

var _debug_handlePassThrough = debug('n:handlePassThrough');
var _debug_handlePassThroughV = debug('v:handlePassThrough');
function handlePassThrough (url_parts, request, response, count) {
  _debug_handlePassThroughV('enter');
  var headers = deepExtend({}, request.headers);
  if (headers.hostname) delete headers.hostname;
  if (headers.host) delete headers.host;


  var opts = {
    method: 'GET',
    host: url_parts.host,
    port: url_parts.port || 80,
    path: url_parts.path,
    headers: headers
  };

  var req = http.request(opts, proxyResponse(response, false, {'x-proxy-via': 'DIRECT'}, true));
  function onError (err) {
    _debug_handlePassThrough('Error/timeout: ', err);

    if (count === undefined) {
      count = 3;
    }

    if (count) {
      handlePassThrough (url_parts, request, response, count - 1);
    } else {
      _debug_handlePassThrough('[!] Give up after 3 tries.');
    }
  }
  handleErrorOnce(req, onError);
  req.end();
}

var _debug_handleChinaProxy = debug('n:handleChinaProxy');
var _debug_handleChinaProxyV = debug('v:handleChinaProxy');
function handleChinaProxy (url_parts, request, response, count) {
  _debug_handleChinaProxyV('enter');
  var opts = util.getProxy();
  var headers = deepExtend({}, request.headers);

  headers.hostname = url_parts.hostname;
  headers.host = url_parts.hostname;
  
  deepExtend(opts, {
    method: 'GET',
    path: url_parts.path,
    headers: headers
  });

  var hadError = false;
  _debug_handleImageDomain('Proxy via %s:%d', opts.hostname, opts.port);
  var req = http.request(opts, proxyResponse(response, false, {'x-proxy-via': opts.hostname + ':' + opts.port}), true, () => {
    if (hadError) return ;
    _debug_handleChinaProxyV('end response.');
    response.ended = true;
    response.end();
  });
  handleErrorOnce(req, () => {
    hadError = true;
    if (count === undefined) {
      count = 3;
    }

    if (count === 0) {
      _debug_handleChinaProxyV('end response.');
      response.ended = true;
      response.end();
    } else {
      _debug_handleImageDomain('[!] Proxy hang up, try another one.');
      handleChinaProxy(url_parts, request, response, count - 1);
    }
  });
  req.end();
}

var _debug_handleImageDomain = debug('n:handleImageDomain');
var _debug_handleImageDomainV = debug('v:handleImageDomain');
function handleImageDomain(url_parts, request, response) {
  _debug_handleImageDomainV('enter');
  var counter = 1;
  if (url_parts.hostname[0] != 'm') {
    // ip as domain
    var parts = url_parts.path.slice(1).split('/');
    url_parts.host = url_parts.hostname = parts.shift();
    url_parts.path = url_parts.pathname = '/' + parts.join('/');
    request.url = url.format(url_parts);
    _debug_handleImageDomain('rebuild url: %s', request.url);
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

    _debug_handleImageDomain('p* domain works, proxy data though.');
    proxyResponse(response, true, {'x-proxy-via': host}, true)(res);
  });
  handleErrorOnce(req, handleImageDomainError);
  req.end();

  function handleImageDomainError () {
    if (counter) {
      counter--;

      // We need to proxy this file, and stop poking.
      _debug_handleImageDomain('p* domain does not work, try proxy..');
      cache[request.url] = _PROXY_CHINA;
      handleChinaProxy (url_parts, request, response);
    }
  }
}

var _debug_proxyResponse = debug('n:proxyResponse');
var _debug_proxyResponseV = debug('v:proxyResponse');
function proxyResponse(response, bFixHeader, otherHeaders, bWriteHeader, onEnd) {
  _debug_proxyResponseV('enter');
  var stack = new Error();
  if (!response) {
  	_debug_proxyResponse('response is empty!');
    return ;
  }

  return (res) => {
    response.on('end', () => {
      response.ended = true;

      if (!res.ended && res.end) {
        res.end();
      }
    });

    response.on('error', (err) => {
      if (err) {
        response.ended = true;
        if (res.end)
          res.end();
        _debug_proxyResponse('Error in response, captured: ', err.message);
        _debug_proxyResponseV(err);
      } else {
        _debug_proxyResponse('Error in response, unknown error.');
      }
    });

    if (bWriteHeader) {
      // 1 year cache, sounds good?
      res.headers['Cache-Control'] = 'max-age=31556926';

      if (bFixHeader)
        res.headers['Content-Type'] = 'audio/mpeg';

      if (!response.wrote) {
        try {
          for (let key in res.headers) {
            response.setHeader(key, res.headers[key]);
          }
          if (otherHeaders) {
            for (let key in otherHeaders) {
              response.setHeader(key, otherHeaders[key]);
            }
          }
          response.writeHead(res.statusCode);
          response.wrote = true;
        } catch (err) {
          _debug_proxyResponse('Skip header.');
        }
      }
    }
    
    res.on('data', (chunk) => {
      if(!response.ended) {
        response.write(chunk);
        _debug_proxyResponseV('Proxied %d bytes.', chunk.length);
      }
    });
    res.on('error', (error) => {
      _debug_proxyResponse('Some error occured.');
      _debug_proxyResponse(error);
    });

    res.on('end', onEnd || () => {
      _debug_proxyResponseV('end response.');

      res.ended = true;

      if (!response.ended && response.end)
        response.end();
    });
  };
}

//Create a server
var server = http.createServer(handleRequest);

//Lets start our server
server.listen(PORT, function(){
  //Callback triggered when server is successfully listening. Hurray!
  debug('app')("Proxy started at port %d", PORT);
});