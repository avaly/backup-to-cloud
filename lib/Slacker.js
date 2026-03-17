const slackr = require('slackr');

const config = require('./config');
const utils = require('./utils');

slackr.conf.uri = config.slackHook;

const Slacker = {
	prepare(data) {
		return Object.assign(
			{
				icon_emoji: ':satellite_antenna:',
				username: 'backup-to-cloud',
			},
			data,
		);
	},

	async send(data) {
		if (config.slackHook) {
			try {
				await slackr(Slacker.prepare(data));
			} catch (err) {
				utils.log(`Slacker.send error: ${err}`);
			}
		}
	},

	text(message) {
		return Slacker.send({ text: message });
	},
};

module.exports = Slacker;
