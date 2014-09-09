var express = require('express');
var bodyParser = require('body-parser');
var errorhandler = require('errorhandler');
var path = require('path');
var fb = require('./fb');

var app = module.exports = express();

app.set('port', process.env.PORT || 3000);
app.use(bodyParser.json());

fb.set('views', path.join(__dirname, 'views'));
fb.set('view engine', 'ejs');
app.use(fb);

app.use(express.static(path.join(__dirname, 'public')));
app.use(function(req, res){
	res.status(404).send('404 Not Found');
});

// Error handling
if ('development' === app.get('env')) {
  app.use(errorhandler());
}
app.use(function (err, req, res, next) {
	console.error(err.stack);
	res.status(500).send('Something broke!');
});