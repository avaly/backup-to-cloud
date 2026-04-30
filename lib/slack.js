import slackr from 'slackr';

import config from './config.js';
import { log } from './utils.js';

slackr.conf.uri = config.slackHook;

export function prepare(data) {
  return Object.assign(
    {
      icon_emoji: ':satellite_antenna:',
      username: 'backup-to-cloud',
    },
    data,
  );
}

export async function send(data) {
  if (config.slackHook) {
    try {
      await slackr(prepare(data));
    } catch (err) {
      log(`slack.send error: ${err}`);
    }
  }
}

export function text(message) {
  return send({ text: message });
}
