var express = require('express');
var graph = require('fbgraph');
var ejs = require('ejs');
var linkify = require('html-linkify');
var conf = require('./config');
var cache = require('./cache');

var app = express();
module.exports = app;

ejs.filters.linkify = function (str) {
	return linkify(str, { attributes: { target: '_blank' } });
};
ejs.filters.nl2br = function (str) {
	return String(str).replace('\n', '<br>');
};
app.engine('ejs', ejs.renderFile);

function refreshGroup(groupName, cb) {
	cb = cb || function () {};

	var group = getGroup(groupName);
	if (!group) {
		process.nextTick(function () {
			cb('Group not found');
		});
		return;
	}

	graph.setAccessToken(group.access_token);
	graph.extendAccessToken({
		access_token: conf.access_token,
		client_id: conf.client_id,
		client_secret: conf.client_secret
	}, function (err, fbRes) {
		if (fbRes.error) {
			cb(err, fbRes);
			return;
		}

		group.access_token = fbRes.access_token;

		graph.get(group.id+'/feed', function (err, fbRes) {
			if (err) {
				cb(err);
				return;
			}

			cache.read(function (err, cacheData) {
				if (err) {
					cb(err, fbRes.data);
					return;
				}

				if (!cacheData) {
					cacheData = {};
				}
				if (!cacheData.groups) {
					cacheData.groups = {};
				}

				cacheData.groups[group.id] = fbRes.data;
				cache.write(cacheData, function (err) {
					cb(err, fbRes.data);
				});
			});
		});
	});
}

var refreshTimeout = null;
function autoRefresh() {
	cache.nextRefresh(function (err, nextRefresh) {
		if (err) {
			return;
		}

		var now = (new Date()).getTime();
		refreshTimeout = setTimeout(function () {
			var remainingGroups = conf.groups.length;
			conf.groups.forEach(function (group) {
				refreshGroup(group.name, function (err) {
					remainingGroups--;

					if (remainingGroups == 0) {
						autoRefresh();
					}
				});
			});
		}, nextRefresh - now);
	});
}

if (conf.cache.auto_update) {
	autoRefresh();
}

function getGroup(groupName) {
	for (var i = 0; i < conf.groups.length; i++) {
		var group = conf.groups[i];

		if (group.name == groupName) {
			return group;
		}
	}
}

app.get('/:group/auth', function (req, res) {
	var groupName = req.params.group;
	var redirect_uri = req.protocol + '://' + req.get('host') + req.originalUrl;

	var group = getGroup(groupName);
	if (!group) {
		res.status(400).send('Cannot find this group');
		return;
	}

	if (group.access_token) {
		req.query.code = group.access_token;
	}

	// we don't have a code yet
	// so we'll redirect to the oauth dialog
	if (!req.query.code) {
		var authUrl = graph.getOauthUrl({
			client_id: conf.client_id,
			redirect_uri: redirect_uri,
			scope: group.scope
		});

		if (!req.query.error) { // checks whether a user denied the app facebook login/permissions
			res.redirect(authUrl);
		} else { // req.query.error == 'access_denied'
			res.status(403).send('access denied');
		}
		return;
	}

	// code is set
	// we'll send that and get the access token
	graph.authorize({
		client_id: conf.client_id,
		redirect_uri: redirect_uri,
		client_secret: conf.client_secret,
		code: req.query.code
	}, function (err, fbRes) {
		console.log(fbRes);
		group.access_token = fbRes.access_token;
		res.redirect('/'+groupName);
	});
});

function showGroup(groupName, res) {
	// Get the group
	var group = getGroup(groupName);
	if (!group) {
		res.status(400).send('Cannot find this group');
		return;
	}

	// Check group access token
	if (!group.access_token) {
		res.redirect('/'+groupName+'/auth');
		return;
	}

	cache.needsRefresh(function (err, needsRefresh) {
		var cb = function (err, data) {
			res.render('feed.ejs', { data: data });
		};

		if (needsRefresh) {
			refreshGroup(groupName, cb);
		} else {
			cache.read(function (err, cacheData) {
				if (err) {
					cb(err);
					return;
				}

				if (!cacheData.groups || !cacheData.groups[group.id]) {
					refreshGroup(groupName, cb);
				} else {
					cb(null, cacheData.groups[group.id]);
				}
			});
		}
	});
}

app.get('/:group', function (req, res) {
	showGroup(req.params.group, res);
});

app.get('/', function (req, res) {
	for (var i = 0; i < conf.groups.length; i++) {
		var group = conf.groups[i];

		if (group.default) {
			showGroup(group.name, res);
			return;
		}
	}

	// No group found
	res.status(400).send('No group specified :-( cannot send sausage');
});