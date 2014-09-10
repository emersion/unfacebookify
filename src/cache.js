var fs = require('fs');
var path = require('path');
var config = require('./config');

var api = {};
module.exports = api;

var cache = null;
var cacheDirPath = path.join(__dirname, 'cache'),
	cacheFilePath = path.join(cacheDirPath, 'index.json');

/**
 * @see https://stackoverflow.com/questions/21194934/node-how-to-create-a-directory-if-doesnt-exist
 */
function ensureDirExists(path, mask, cb) {
	if (typeof mask == 'function') { // allow the `mask` parameter to be optional
		cb = mask;
		mask = 0777;
	}

	fs.mkdir(path, mask, function(err) {
		if (err) {
			if (err.code == 'EEXIST') cb(null); // ignore the error if the folder already exists
			else cb(err); // something else went wrong
		} else cb(null); // successfully created folder
	});
}

api.needsRefresh = function (cb) {
	var needsRefresh = false;
	if (!cache) {
		needsRefresh = true;
	} else {
		var now = (new Date()).getTime(),
			minNextUpdate = cache.last_update + config.cache.min_update_interval * 1000;

		if (now < minNextUpdate) {
			needsRefresh = false;
		} else {
			needsRefresh = true;
		}
	}

	process.nextTick(function () {
		cb(null, needsRefresh);
	});
};

api.nextRefresh = function (cb) {
	var nextRefresh = 0;
	if (cache) {
		nextRefresh = cache.last_update + config.cache.update_interval * 1000;
	}

	process.nextTick(function () {
		cb(null, nextRefresh);
	});
};

api.read = function (cb) {
	if (cache) {
		cb(null, cache.data);
		return;
	}

	// Does the cache file exist?
	fs.exists(cacheFilePath, function (exists) {
		if (exists) {
			fs.readFile(cacheFilePath, function (err, json) {
				if (err) {
					cb(err);
					return;
				}

				cache = JSON.parse(json);
				cb(null, cache.data);
			});
		} else {
			cb(null, null);
		}
	});
};

api.write = function (data, cb) {
	// Make sure the cache dir exists
	ensureDirExists(cacheDirPath, function (err) {
		if (err) {
			cb(err);
			return;
		}

		var newCache = {
			last_update: (new Date()).getTime(),
			data: data
		};
		fs.writeFile(cacheFilePath, JSON.stringify(newCache), function (err) {
			if (err) {
				cb(err);
				return;
			}

			cache = newCache;
			cb(null);
		});
	});
};