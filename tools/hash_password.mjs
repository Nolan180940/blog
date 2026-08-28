/**
 * Password Hashing Tool
 *
 * Usage:
 *   node hash_password.mjs <password>
 *
 * Generates a bcrypt hash for use in admin_config table.
 * Example: node hash_password.mjs MyStr0ngP@ss
 *
 * Requires: npm install bcryptjs
 *   or: npx bcryptjs <password>
 */

import bcrypt from 'bcryptjs';

const password = process.argv[2];

if (!password) {
  console.error('Usage: node hash_password.mjs <password>');
  console.error('Password must be ≥8 chars, include uppercase, lowercase, and digits.');
  process.exit(1);
}

// Validate complexity
const hasUpper = /[A-Z]/.test(password);
const hasLower = /[a-z]/.test(password);
const hasDigit = /[0-9]/.test(password);

if (password.length < 8 || !hasUpper || !hasLower || !hasDigit) {
  console.error('❌ Password does not meet complexity requirements:');
  console.error('   - Minimum 8 characters');
  console.error('   - At least one uppercase letter (A-Z)');
  console.error('   - At least one lowercase letter (a-z)');
  console.error('   - At least one digit (0-9)');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);

console.log('');
console.log('✅ Bcrypt hash (cost factor 10):');
console.log('');
console.log(hash);
console.log('');
console.log('SQL to update admin password:');
console.log('');
console.log(`UPDATE admin_config SET password_hash = '${hash}' WHERE id = 1;`);
console.log('');
