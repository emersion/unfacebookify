var fs = require('fs');
var path = require('path');

var configPath = path.join(__dirname, 'config.json');
module.exports = function (config, cb) {
	return fs.writeFile(configPath, JSON.stringify(config, undefined, 2), cb);
};