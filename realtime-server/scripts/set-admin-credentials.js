/* ============================================================
   Set or rotate the single organizer credential.
   Usage: npm run set-admin-credentials -- --username=X --password=Y
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
  console.error('Usage: npm run set-admin-credentials -- --username=<user> --password=<pass>');
  process.exit(1);
}

setMeta('admin_username', args.username);
setMeta('admin_password_hash', bcrypt.hashSync(args.password, 12));
console.log(`Organizer credential set for "${args.username}".`);
