unfacebookify
=============

Allow unregistered Facebook users to access a group's posts

## Installation

Edit `src/config.json` and add your app's API key and secret, and the Facebook group id (shown in the group's page URL).

Then run `node src/index.js` to run  the server.

You will have first to login with your own Facebook account, authorize your app and then your access token will be stored in the RAM. To make it persistent, read the server logs and fill in `access_token` in the config file.

The page should now display the group's messages and comments.
