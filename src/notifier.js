var fs = require('fs');
var path = require('path');
var nodemailer = require('nodemailer');
var ejs = require('ejs');
var config = require('./config');
var cache = require('./cache');

// create reusable transporter object using SMTP transport
var transporter = nodemailer.createTransport(config.notify.transport);

// The e-mail template
var emailTpl = fs.readFileSync(path.join(__dirname, 'views', 'emails', 'post.ejs')).toString();

module.exports = function (options, cb) {
	cb = cb || function () {};

	var group = options.group,
		post = options.post,
		to = group.notify;

	// Notifications disabled or no recipient
	if (!config.notify.enabled || !to || (typeof to != 'string' && !to.length)) {
		process.nextTick(function () {
			cb();
		});
		return;
	}

	var renderOptions = {
		to: to,
		group: group,
		post: post,
		host: config.host
	};

	var from = config.notify.from;
	if (!~from.indexOf('<')) {
		from = post.from.name+' <'+from+'>'
	}

	var domain = config.notify.transport.host,
		domainSuffix = (domain) ? '@'+domain : '';

	// send mail with defined transport object
	transporter.sendMail({
		messageId: 'unfacebookify/'+group.id+'/'+post.id+domainSuffix,
		references: 'unfacebookify/'+group.id+domainSuffix,
		inReplyTo: 'unfacebookify/'+group.id+domainSuffix,
		from: from,
		to: to,
		subject: ejs.render(config.notify.subject, renderOptions),
		text: ejs.render(emailTpl, renderOptions)
	}, function (err, info) {
		console.log(err, info);
		cb(err);
	});
};