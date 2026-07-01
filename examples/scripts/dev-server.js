#!/usr/bin/env node

/**
 * Development server with hot reload for sample YAML files
 *
 * This script:
 * 1. Watches sample YAML files for changes
 * 2. Rebuilds samples.json and copies samples on change
 * 3. Auto-reloads the browser using BrowserSync
 */

const chokidar = require('chokidar');
const browserSync = require('browser-sync').create();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SAMPLES_DIR = path.join(__dirname, '../samples');
const DIST_DIR = path.join(__dirname, '../dist');
const WATCH_PATTERNS = [
  path.join(SAMPLES_DIR, '**/*.dash.yaml'),
  path.join(SAMPLES_DIR, '**/*.dash.yml'),
  path.join(SAMPLES_DIR, '**/*.yml'),
  path.join(SAMPLES_DIR, '**/*.yaml')
];

console.log('🚀 Starting Melviz Development Server...\n');

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  console.log('📦 Running initial build...');
  execSync('npm run build', { stdio: 'inherit' });
}

// Function to rebuild samples
function rebuild() {
  console.log('🔄 Sample changed, rebuilding...');
  const startTime = Date.now();

  try {
    // Regenerate samples.json and copy samples
    execSync('npm run generate-samples', { stdio: 'pipe' });
    execSync('npm run copy-samples', { stdio: 'pipe' });

    const duration = Date.now() - startTime;
    console.log(`✅ Rebuild complete (${duration}ms)`);

    // Reload browser
    browserSync.reload();
  } catch (error) {
    console.error('❌ Rebuild failed:', error.message);
  }
}

// Initialize BrowserSync
browserSync.init({
  server: {
    baseDir: DIST_DIR
  },
  port: 8080,
  ui: {
    port: 8081
  },
  open: true,
  notify: true,
  logLevel: 'info',
  logPrefix: 'Melviz',
  files: [
    // Watch dist directory for changes (from rebuilds)
    path.join(DIST_DIR, '**/*.html'),
    path.join(DIST_DIR, '**/*.js'),
    path.join(DIST_DIR, '**/*.css'),
    path.join(DIST_DIR, 'samples.json')
  ]
}, () => {
  console.log('\n✨ Development server ready!');
  console.log(`   Local: http://localhost:8080`);
  console.log(`   UI: http://localhost:8081`);
  console.log(`\n👀 Watching sample files in: ${SAMPLES_DIR}`);
  console.log('   Edit any .dash.yaml file to see changes instantly!\n');
});

// Watch sample files
const watcher = chokidar.watch(WATCH_PATTERNS, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  ignoreInitial: true
});

watcher
  .on('add', (filePath) => {
    console.log(`📄 Sample added: ${path.relative(SAMPLES_DIR, filePath)}`);
    rebuild();
  })
  .on('change', (filePath) => {
    console.log(`📝 Sample modified: ${path.relative(SAMPLES_DIR, filePath)}`);
    rebuild();
  })
  .on('unlink', (filePath) => {
    console.log(`🗑️  Sample deleted: ${path.relative(SAMPLES_DIR, filePath)}`);
    rebuild();
  })
  .on('error', (error) => {
    console.error('❌ Watcher error:', error);
  });

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down development server...');
  watcher.close();
  browserSync.exit();
  process.exit(0);
});
