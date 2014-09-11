unfacebookify
=============

Allow unregistered Facebook users to access a group's posts.

## How it looks like

Unfacebookify displays for each post a box containing the message and the comments.

![147_selection](https://cloud.githubusercontent.com/assets/506932/4220089/e9939bb0-38fe-11e4-86ab-74a3d26ebf11.png)

## Features

* Shows posts and comments with profile pictures, displays well links and e-mail addresses
* Caching (maximum and minimum update frequency in config)
* Multiple groups (access a group by typing `/{group_name}` in the URL)
* Backed by sausages

## Installation

You will need a Facebook account and a Facebook app, which will be used to access the group's data.

Edit `src/config.json` and add your app's API key and secret in `client_id` and `client_secret`, the Facebook group id (shown in the group's page URL) in `id` and a unique name for this group in `name`.

Then run `node src/index.js` to run  the server.

You will have first to login with your own Facebook account, authorize your app and then your access token will be stored in the RAM. To make it persistent, read the server logs and fill in `access_token` in the config file.

The page should now display the group's messages and comments.
