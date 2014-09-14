var inspect = require('util').inspect;
var Imap = require('imap');
var MailParser = require('mailparser').MailParser;
var EmailReplyParser = require('emailreplyparser').EmailReplyParser;
var config = require('./config');

var imap = new Imap(config.watch.transport);

module.exports = function (cb) {
	cb = cb || function () {};

	if (!config.watch.enabled) {
		cb(null, []);
		return;
	}

	function connected() {
		imap.openBox('INBOX', false, function (err, box) {
			if (err) {
				cb(err);
				return;
			}

			fetchMessages(box);
		});
	}

	function fetchMessages(box) {
		if (!box.messages.total) {
			imap.end();
			cb(null, []);
			return;
		}

		imap.search([ 'UNSEEN', ['TO', config.notify.from] ], function (err, results) {
			if (err) {
				cb(err);
				return;
			}

			if (!results.length) {
				imap.end();
				cb(null, []);
				return;
			}

			var remainingEmails = 0, messages = [];
			function msgFetched(email) {
				remainingEmails--;

				var group = {},
					post = {},
					msg = {
						from: email.from[0],
						group: group,
						post: post,
						content: ''
					};

				// Parse In-Reply-To header
				if (email.inReplyTo && email.inReplyTo[0]) {
					var path = email.inReplyTo[0].split('@')[0];
					var parts = String(path).split('/');

					if (parts[0] == 'unfacebookify') {
						group.id = parts[1];
						post.id = parts[2];
					}
				}

				// Parse subject
				var subjectMatch = /\[([^\]]+)\]/.exec(email.subject);
				if (subjectMatch) {
					group.title = subjectMatch[1];
				}

				// Parse content, remove citations of previous messages
				var content = EmailReplyParser.parse_reply(email.text);

				// Remove French citation headers (Le ******, *** a écrit :)
				var lastLineOffset = content.lastIndexOf('\n'),
					lastLine = content.substr(lastLineOffset + 1);
				if (/^(Le\s(\n|.)*écrit :)$/m.test(lastLine)) {
					content = content.substr(0, lastLineOffset - 1);
				}

				msg.content = content;

				// Filter incorrect messages
				if (msg.content && (msg.group.id || msg.group.title)) {
					messages.push(msg);
				}

				if (!remainingEmails) {
					cb(null, messages);
				}
			}

			var f = imap.fetch(results, {
				bodies: '',
				markSeen: true
			});
			f.on('message', function (msg, seqno) {
				msg.on('body', function (stream, info) {
					var mailparser = new MailParser();
					mailparser.on('end', function (email) {
						msgFetched(email);
					});

					stream.pipe(mailparser);
				});

				remainingEmails++;
			});
			f.once('error', function (err) {
				console.log('Fetch error: ' + err);
			});
			f.once('end', function () {
				imap.end();
			});
		});
	}

	if (imap.state == 'disconnected') {
		imap.once('ready', function () {
			connected();
		});
		imap.once('error', function (err) {
			cb(err);
		});
		imap.once('end', function () {
			console.log('Connection ended.');
		});

		imap.connect();
	} else {
		connected();
	}
};