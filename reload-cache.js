/* jshint esversion:6,node:true */
var fs = require('fs');
var util = require('./src/util');

util.updProxyList(( ) => {
	util.writeProxies();
});