/* jshint esversion:6,node:true */
var util = require('./src/util');
var debug = require('debug');

var debug_loader = debug('n:loader');
util.loadProxies(() => require('./src/proxy'));