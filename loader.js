/* jshint esversion:6,node:true */
var util = require('./src/util');
var debug = require('debug');

var debug_loader = debug('n:loader');
util.loadProxies(() => {
	require('./src/proxy');

	// Update proxy cache every 6 hours.
	setInterval(() => {
		util.updProxyList(() => {
			debug_loader('Proxy updated, next update will be 6 hours later.');
			util.writeProxies();
		}, false);
	}, 1000 * 60 * 60 * 6);
});