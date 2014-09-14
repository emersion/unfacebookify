var express = require('express');
var graph = require('fbgraph');
var ejs = require('ejs');
var linkify = require('html-linkify');
var config = require('./config');
var cache = require('./cache');
var writeconfig = require('./config-writer');
var notify = require('./notifier');
var watch = require('./watcher');

var app = express();
module.exports = app;

ejs.filters.linkify = function (str) {
	return linkify(str || '', { attributes: { target: '_blank' } });
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
		access_token: config.access_token,
		client_id: config.client_id,
		client_secret: config.client_secret
	}, function (err, fbRes) {
		if (fbRes.error) {
			cb(err, fbRes);
			return;
		}

		group.access_token = fbRes.access_token;

		var fields = 'id,from,message,created_time,attachments,comments{from,message,created_time,like_count,attachment}';
		graph.get(group.id+'/feed?fields='+fields, function (err, fbRes) {
			if (err) {
				cb(err);
				return;
			}

			var data = fbRes.data;

			cache.read(function (err, cacheData) {
				if (err) {
					cb(err, data);
					return;
				}

				if (!cacheData) {
					cacheData = {};
				}
				if (!cacheData.groups) {
					cacheData.groups = {};
				}

				// Check for new posts if the cache is not empty
				if (cacheData.groups[group.id]) {
					var newPosts = [];
					var groupData = cacheData.groups[group.id];

					for (var i = 0; i < data.length; i++) {
						var freshPost = data[i];

						var isOld = false;
						for (var j = 0; j < groupData.length; j++) {
							var cachedPost = groupData[j];

							if (cachedPost.id == freshPost.id) {
								isOld = true;
								break;
							}
						}

						if (!isOld) {
							newPosts.push(freshPost);
						} else {
							// Try to populate object from cache
							data[i].object = cachedPost.object;
						}
					}

					if (newPosts.length > 0) {
						newPosts.forEach(function (post) {
							notify({
								post: post,
								group: group
							});
						});
					}
				}

				cacheData.groups[group.id] = data;
				cache.write(cacheData, function (err) {
					cb(err, data);
				});
			});
		});
	});
}

function postMessage(group, msg, cb) {
	cb = cb || function () {};

	// Allow incoming messages from users in notify list only
	if (!(group.notify instanceof Array) || !~group.notify.indexOf(msg.from.address)) {
		process.nextTick(function () {
			cb('The e-mail address "'+msg.from.address+'" is not in the notify list for the group "'+group.name+'"');
		});
		return;
	}

	var content = 'From '+msg.from.name+' <'+msg.from.address+'>\n'+msg.content;
	var endpoint = (msg.post) ? msg.post+'/comments' : group.id+'/feed';

	graph.setAccessToken(group.access_token);
	graph.post(endpoint, {
		message: content
	}, cb);
}

function watchNewPosts() {
	watch(function (err, messages) {
		if (err) {
			console.log(err);
			return;
		}

		messages.forEach(function (msg) {
			// Get group
			var groupAttrName = (msg.group.id) ? 'id' : 'title';
			var group = getGroup(msg.group[groupAttrName], groupAttrName);

			// Post message
			postMessage(group, {
				from: msg.from,
				content: msg.content,
				post: msg.post.id
			}, function (err) {
				if (err) {
					console.log('Cannot post message from e-mail', err);
					return;
				}
			});
		});
	});
}

var refreshTimeout = null;
function autoRefresh() {
	cache.nextRefresh(function (err, nextRefresh) {
		if (err) {
			console.log(err);
			return;
		}

		var now = (new Date()).getTime();
		refreshTimeout = setTimeout(function () {
			var remainingGroups = config.groups.length;
			config.groups.forEach(function (group) {
				refreshGroup(group.name, function (err) {
					remainingGroups--;

					if (remainingGroups == 0) { // Finished
						watchNewPosts();
						autoRefresh();
					}
				});
			});
		}, nextRefresh - now);
	});
}

if (config.cache.auto_refresh) {
	autoRefresh();
}

function getReqUrl(req) {
	return req.protocol + '://' + req.get('host') + req.originalUrl;
}

function getGroup(attrValue, attrName) {
	attrName = attrName || 'name';

	for (var i = 0; i < config.groups.length; i++) {
		var group = config.groups[i];

		if (group[attrName] == attrValue) {
			return group;
		}
	}
}

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
			res.render('feed.ejs', {
				data: data,
				postByEmail: {
					enabled: config.watch.enabled,
					address: config.notify.from,
					subject: '['+group.title+']'
				}
			});
		};

		if (needsRefresh) {
			refreshGroup(groupName, cb);
			watchNewPosts();
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

function authWithFacebook(res, options) {
	var authUrl = graph.getOauthUrl({
		client_id: config.client_id,
		redirect_uri: options.redirect_uri,
		scope: options.scope
	});

	res.redirect(authUrl);
}

function authorizeFacebook(options, cb) {
	graph.authorize({
		client_id: config.client_id,
		redirect_uri: options.redirect_uri,
		client_secret: config.client_secret,
		code: options.code
	}, cb);
}

app.get('/auth', function (req, res) {
	var redirect_uri = getReqUrl(req);

	if (!req.query.code) {
		if (!req.query.error) { // checks whether a user denied the app facebook login/permissions
			authWithFacebook(res, {
				redirect_uri: redirect_uri,
				scope: config.scope
			});
		} else { // req.query.error == 'access_denied'
			res.status(403).send('access denied');
		}
		return;
	}

	// code is set
	// we'll send that and get the access token
	authorizeFacebook({
		redirect_uri: redirect_uri,
		code: req.query.code
	}, function (err, fbRes) {
		console.log(fbRes);

		res.redirect('/new?access_token='+fbRes.access_token);
	});
});

app.all('/new', function (req, res, next) {
	if (!config.allow_add) { // Make sure the user is allowed to add new groups
		res.status(403).send('Access denied');
		return;
	}

	next();
});

app.get('/new', function (req, res) {
	var view = {
		authenticated: !!req.query.access_token,
		error: ''
	};

	var render = function () {
		res.render('add.ejs', view);
	};

	if (view.authenticated) {
		view.access_token = req.query.access_token;

		graph.setAccessToken(view.access_token);
		graph.get('/me/groups', function (err, fbRes) {
			if (err) {
				res.status(500).send('Cannot retrieve your groups');
				return;
			}

			view.groups = fbRes.data;

			render();
		});
	} else {
		render();
	}
});

app.post('/new', function (req, res) {
	var view = {
		authenticated: true,
		error: '',
		access_token: req.body.access_token
	};

	var group = {
		id: req.body.id,
		name: req.body.name.replace(/\s+/g, '_'),
		title: req.body.title || req.body.name,
		access_token: req.body.access_token,
		scope: config.scope
	};

	if (getGroup(group.name)) {
		res.status(400).send('This group name already exist');
		return;
	}

	config.groups.push(group);

	writeconfig(config, function (err) {
		if (err) {
			res.status(500).send(err);
		} else {
			res.redirect('/'+group.name);
		}
	});
});

app.get('/:group/auth', function (req, res) {
	var groupName = req.params.group;
	var redirect_uri = getReqUrl(req);

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
		if (!req.query.error) { // checks whether a user denied the app facebook login/permissions
			authWithFacebook(res, {
				redirect_uri: redirect_uri,
				scope: group.scope
			});
		} else { // req.query.error == 'access_denied'
			res.status(403).send('access denied');
		}
		return;
	}

	// code is set
	// we'll send that and get the access token
	authorizeFacebook({
		redirect_uri: redirect_uri,
		code: req.query.code
	}, function (err, fbRes) {
		console.log(fbRes);
		group.access_token = fbRes.access_token;

		if (group.default) {
			res.redirect('/');
		} else {
			res.redirect('/'+groupName);
		}

		writeconfig(config);
	});
});

app.get('/', function (req, res) {
	for (var i = 0; i < config.groups.length; i++) {
		var group = config.groups[i];

		if (group.default) {
			showGroup(group.name, res);
			return;
		}
	}

	if (config.allow_add) {
		res.redirect('/new');
		return;
	}

	// No group found
	res.status(400).send('No group specified :-( cannot send sausage');
});

app.get('/:group', function (req, res) {
	showGroup(req.params.group, res);
});