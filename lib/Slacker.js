const slackr = require('slackr');

const config = require('./config');

slackr.conf.uri = config.slackHook;

const Slacker = {
	prepare(data) {
		return Object.assign({
			icon_emoji: ':satellite_antenna:',
			username: 'backup-to-cloud'
		}, data);
	},

	send(data) {
		if (config.slackHook) {
			return slackr(Slacker.prepare(data));
		}
		return Promise.reject();
	},

	text(message) {
		return Slacker.send({ text: message });
	},
};

module.exports = Slacker;
