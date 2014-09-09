var app = require('./app');

module.exports = app.listen(app.get('port'), function() {
	console.log('Server listening on port ' + app.get('port'));
});