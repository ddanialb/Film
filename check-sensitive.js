#!/usr/bin/env node

/**
 * Check for sensitive files before git commit
 * Run: node check-sensitive.js
 */

const fs = require('fs');
const path = require('path');

const SENSITIVE_FILES = [
  '.env',
  'data/telegram_session.txt',
  'data/streamwide_refresh.txt',
  'data/playlist_cache.json',
  'data/telegram_code.txt',
  'telegram_session.txt',
  'streamwide_refresh.txt',
  'playlist_cache.json',
];

const SENSITIVE_PATTERNS = [
  /TELEGRAM_API_ID=\d+/,
  /TELEGRAM_API_HASH=[a-f0-9]+/,
  /TELEGRAM_PHONE=\+\d+/,
  /FARSILAND_PASSWORD=.+/,
];

console.log('🔍 Checking for sensitive files...\n');

let foundIssues = false;

// Check for sensitive files
SENSITIVE_FILES.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`⚠️  Found sensitive file: ${file}`);
    foundIssues = true;
  }
});

// Check .gitignore exists
if (!fs.existsSync('.gitignore')) {
  console.log('❌ .gitignore not found!');
  foundIssues = true;
} else {
  const gitignore = fs.readFileSync('.gitignore', 'utf8');
  
  // Check if sensitive files are in .gitignore
  const missingInGitignore = [];
  SENSITIVE_FILES.forEach(file => {
    if (!gitignore.includes(file) && !gitignore.includes(path.dirname(file) + '/')) {
      missingInGitignore.push(file);
    }
  });
  
  if (missingInGitignore.length > 0) {
    console.log('⚠️  These files are not in .gitignore:');
    missingInGitignore.forEach(f => console.log(`   - ${f}`));
    foundIssues = true;
  }
}

// Check for sensitive data in tracked files
const checkFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  
  const content = fs.readFileSync(filePath, 'utf8');
  SENSITIVE_PATTERNS.forEach(pattern => {
    if (pattern.test(content)) {
      console.log(`⚠️  Found sensitive data in: ${filePath}`);
      console.log(`   Pattern: ${pattern}`);
      foundIssues = true;
    }
  });
};

// Check common files
['README.md', 'DEPLOY.md', 'server.js'].forEach(checkFile);

console.log('');

if (foundIssues) {
  console.log('❌ Found sensitive data issues!');
  console.log('');
  console.log('Before committing:');
  console.log('1. Make sure .env is in .gitignore');
  console.log('2. Make sure data/ directory is in .gitignore');
  console.log('3. Remove any sensitive data from tracked files');
  console.log('4. Use .env.example instead of .env');
  console.log('');
  process.exit(1);
} else {
  console.log('✅ No sensitive data found. Safe to commit!');
  process.exit(0);
}
