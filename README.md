unfacebookify
=============

Allow unregistered Facebook users to access a group's posts.

**Live demo: http://unfacebookify.herokuapp.com/**

## How it looks like

Unfacebookify displays for each post a box containing the message and the comments.

![147_selection](https://cloud.githubusercontent.com/assets/506932/4220089/e9939bb0-38fe-11e4-86ab-74a3d26ebf11.png)

## Features

* Shows posts and comments with profile pictures, displays well links and e-mail addresses
* Caching (maximum and minimum update frequency in config)
* Multiple groups (access a group by typing `/{group_name}` in the URL)
* Option to let everyone unfacebookify any group by logging in with their Facebook account
* E-mail notifications
* Allow users to post to a Facebook group by e-mail
* [Per-group custom Facebook apps](https://github.com/emersion/unfacebookify/wiki/Use-a-custom-Facebook-app)
* Backed by sausages

## Installation

You will need a Facebook account and a Facebook app, which will be used to access the group's data.

Edit `src/config.json` and add your app's API key and secret in `client_id` and `client_secret`, the Facebook group id (shown in the group's page URL) in `id` and a unique name for this group in `name`.

Then run `node src/index.js` to run  the server.

You will have first to login with your own Facebook account, authorize your app and then your access token will be stored in the config file.

The page should now display the group's messages and comments.

## Configuration

All configuration is stored in `src/config.json`.

```js
{
	"client_id": "", // Your app id
	"client_secret": "", // Your app secret
	"scope": "user_groups", // Default scope for new groups
	"groups": [], // List of registered groups
	"cache": { // Cache config
		"min_update_interval": 60, // Minimum interval of time between two updates from Facebook (in seconds)
		"update_interval": 900, // Interval of time between two auto updates from Facebook (in seconds)
		"auto_update": false // Auto-update the cache each update_interval seconds
	},
	"notify": { // Notify some users for new posts
		"enabled": false, // Enable notifications
		"from": "bot+unfacebookify@example.org", // From header
		"subject": "[<%= group.title %>] New post from <%= post.from.name %>", // E-mail subject
		"transport": { // Transport - see Nodemailer options
			// Example with SMTP - see https://github.com/andris9/nodemailer-smtp-transport#usage
			"host": "mail.example.org",
			"port": "25",
			"secure": true,
			"auth": {
				"user": "bot@example.org",
				"pass": "42"
			}
		}
	},
	"watch": { // Watch an e-mail inbox for messages to post
		"enabled": false, // Allow users to post messages in a Facebook group by e-mail
		"transport": { // Transport - see node-imap options
			// See https://github.com/mscdex/node-imap#connection-instance-methods
			"user": "bot@example.org",
			"password": "42",
			"host": "mail.example.org",
			"port": 993,
			"tls": true
		}
	},
	"allow_add": true, // Allow everyone to add their own groups
	"host": "http://example.org" // The server URL - will be used in emails (optional)
}
```

The `groups` field contains a list of registered groups. Each group has the following syntax:
```js
{
  "id": "", // The Facebook group id
  "name": "", // A unique identifier for this group - will appear in the URL
  "title": "", // The group title
  "access_token": "", // The access token which will be used to update the grouyp feed
  "scope": "", // The Facebook scope for this group
  "default": false, // If set to true, the main page will display this group's feed (optional)
  "notify": ["contact@example.org"], // E-mail addresses which will receive e-mail notifications from this group (optional)
  "client_id": "", // Override the app ID for this group (optional)
  "client_secret": "" // Override the app secret for this group (optional)
}
```
