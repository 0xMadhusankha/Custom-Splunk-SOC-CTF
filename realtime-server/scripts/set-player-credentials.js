/* ============================================================
   Set or rotate the single shared player operator credential.
   Usage: npm run set-player-credentials -- --username=X --password=Y
   ============================================================ */

import bcrypt from 'bcryptjs';
import { setMeta } from '../db.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);

if (!args.username || !args.password) {
  console.error('Usage: npm run set-player-credentials -- --username=<user> --password=<pass>');
  process.exit(1);
}

setMeta('player_username', args.username);
setMeta('player_password_hash', bcrypt.hashSync(args.password, 12));
console.log(`Player operator credential set for "${args.username}".`);
