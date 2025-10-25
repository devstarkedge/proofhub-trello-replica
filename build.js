#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Building FlowTask for Vercel deployment...\n');

// Check if frontend dist directory exists
const frontendDistPath = path.join(__dirname, 'frontend', 'dist');
if (!fs.existsSync(frontendDistPath)) {
  console.log('📦 Building frontend...');
  try {
    execSync('cd frontend && npm run build', { stdio: 'inherit' });
    console.log('✅ Frontend built successfully\n');
  } catch (error) {
    console.error('❌ Frontend build failed:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ Frontend already built\n');
}

// Check if all required API files exist
const requiredApiFiles = [
  'backend/api/index.js',
  'backend/api/auth.js',
  'backend/api/boards.js',
  'backend/api/cards.js',
  'backend/api/lists.js',
  'backend/api/teams.js',
  'backend/api/users.js',
  'backend/api/comments.js',
  'backend/api/notifications.js',
  'backend/api/search.js',
  'backend/api/analytics.js',
  'backend/api/departments.js',
  'backend/api/admin.js'
];

console.log('🔍 Checking API files...');
let allFilesExist = true;

requiredApiFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  console.log('\n❌ Some API files are missing. Please ensure all API files are created.');
  process.exit(1);
}

console.log('\n✅ All API files present');

// Check vercel.json
const vercelConfigPath = path.join(__dirname, 'vercel.json');
if (fs.existsSync(vercelConfigPath)) {
  console.log('✅ vercel.json found');
} else {
  console.log('❌ vercel.json missing');
  process.exit(1);
}

// Check package.json files
const packageFiles = [
  'package.json',
  'backend/package.json',
  'frontend/package.json'
];

console.log('\n📋 Checking package.json files...');
packageFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    process.exit(1);
  }
});

console.log('\n🎉 Build verification complete!');
console.log('\n📝 Next steps:');
console.log('1. Set up your environment variables in Vercel dashboard');
console.log('2. Deploy to Vercel using: vercel');
console.log('3. Or connect your GitHub repository to Vercel');
console.log('\n📖 See DEPLOYMENT.md for detailed instructions');
