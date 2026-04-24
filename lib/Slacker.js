import slackr from 'slackr';

import config from './config.js';
import utils from './utils.js';

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

export default Slacker;
