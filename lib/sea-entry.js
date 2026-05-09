import { main } from './cli.js';

main(process.argv).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
