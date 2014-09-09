var express = require('express');
var graph = require('fbgraph');
var ejs = require('ejs');
var linkify = require('html-linkify');
var conf = require('./config');

var app = express();
module.exports = app;

ejs.filters.linkify = function (str) {
	return linkify(str, { attributes: { target: '_blank' } });
};
ejs.filters.nl2br = function (str) {
	return String(str).replace('\n', '<br>');
};
app.engine('ejs', ejs.renderFile);

app.get('/auth/facebook', function(req, res) {
	var redirect_uri = 'http://'+req.headers.host+'/auth/facebook';

	if (conf.access_token) {
		req.query.code = conf.access_token;
	}

	// we don't have a code yet
	// so we'll redirect to the oauth dialog
	if (!req.query.code) {
		var authUrl = graph.getOauthUrl({
			"client_id":     conf.client_id
			, "redirect_uri":  redirect_uri
			, "scope":         conf.scope
		});

		if (!req.query.error) { //checks whether a user denied the app facebook login/permissions
			res.redirect(authUrl);
		} else {  //req.query.error == 'access_denied'
			res.send('access denied');
		}
		return;
	}

	// code is set
	// we'll send that and get the access token
	graph.authorize({
		"client_id": conf.client_id
		, "redirect_uri": redirect_uri
		, "client_secret": conf.client_secret
		, "code": req.query.code
	}, function (err, fbRes) {
		console.log(fbRes);
		conf.access_token = fbRes.access_token;
		res.redirect('/');
	});
});

app.get('/', function(req, res) {
	if (!conf.access_token) {
		res.redirect('/auth/facebook');
		return;
	}

	graph.get(conf.group+'/feed', function(err, fbRes) {
		if (fbRes.error) {
			if (fbRes.error.code == 104) {
				graph.extendAccessToken({
					"access_token": conf.access_token
					, "client_id": conf.client_id
					, "client_secret":conf.client_secret
				}, function (err, fbRes) {
					conf.access_token = fbRes.access_token;
					graph.setAccessToken(conf.access_token);
					res.redirect('/');
				});
				return;
			} else {
				console.warn(fbRes.error);
			}
		}

		res.render('feed.ejs', fbRes);
	});
});