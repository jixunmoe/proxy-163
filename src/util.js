/* jshint esversion:6 */
var http = require('http');
var proxies = [];
var fs = require('fs');
var cheerio = require('cheerio');
var debug = require('debug');

function random (max) {
	return ~~(Math.random() * proxies.length);
}

function getProxy () {
	return proxies[random()];
}

var _debug_updateProxyList = debug('n:updateProxyList');
function updateProxyList (callback, loadFromCache) {
	if (loadFromCache) {
		try {
			var p = fs.readFileSync('./cn-proxy.html');
			finialiseProxyUpdate(callback, p.toString());
			_debug_updateProxyList('[*] Proxy list loaded from cache.');
			return ;
		} catch (err) {
			_debug_updateProxyList('[!] Failed to load proxy from cache, updating online..');
		}
	}

	_debug_updateProxyList('[*] Fetch proxy list..');
	http.get({
		host: 'cn-proxy.com',
		port: 80,
		path: '/'
	}, function (res) {
		var body = '';
		res.on('data', function (chunk) {
			body += chunk;
		});
		res.on('end', function () {
			finialiseProxyUpdate(callback, body);
		});
	}).on('error', function (err) {
		_debug_updateProxyList('[x] Failed to fetch proxy list.');
		process.exit(1);
	});
}

var _debug_finialiseProxyUpdate = debug('n:finialiseProxyUpdate');
function finialiseProxyUpdate (callback, body) {
	var _proxies = [];
	var $ = cheerio.load(body);
	$('.table-container tr').each(function (i, row) {
		var childrens = row.children.filter(function (row) { return row.type == 'tag' });
		var port = parseInt($(childrens[1]).text());
		if (port) {
			_proxies.push({
				hostname: $(childrens[0]).text(),
				port: port
			});
		}
	});

	proxies = _proxies;
	_debug_finialiseProxyUpdate('[*] %d proxies loaded!', proxies.length);
	callback(_proxies);
}

function removeComment (str) {
	return str.trim()[0] != '#';
}

function convProxy (proxy) {
	var data = proxy.split(':');
	return {
		hostname: data[0],
		port: data[1]
	};
}

var _debug_loadProxies = debug('n:loadProxies');
function loadProxies (callback) {
	var _proxies = [];
	_proxies = fs.readFileSync('./proxies.txt', 'utf8').split('\n').filter(removeComment).map(convProxy);
	proxies = _proxies;
	_debug_loadProxies('[*] %d proxies loaded!', proxies.length);
	callback(_proxies);
}

function writeProxies () {
	var _proxies = proxies.map(function (proxy) {
		return proxy.hostname + ':' + proxy.port;
	});
	_proxies.splice(0, 0, '# Proxy data (one per row, format ip:port)\n# Generated at time ' + (new Date()));
	fs.writeFileSync('./proxies.txt', _proxies.join('\n'), 'utf8');
}

module.exports = {
	getProxy: getProxy,
	updProxyList: updateProxyList,
	loadProxies: loadProxies,
	writeProxies: writeProxies
};