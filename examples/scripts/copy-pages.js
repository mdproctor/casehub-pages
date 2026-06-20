const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../../webapp/dist');
const targetDir = path.join(__dirname, '../dist/pages-webapp');

// Helper function to recursively copy directory
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.error(`Source directory not found: ${src}`);
    console.error('Please build the pages-webapp first by running: yarn build');
    process.exit(1);
  }

  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const files = fs.readdirSync(src);
    for (const file of files) {
      copyRecursive(path.join(src, file), path.join(dest, file), false);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Create dist directory if it doesn't exist
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Copy pages-webapp
console.log('Copying pages-webapp from:', sourceDir);
console.log('To:', targetDir);
copyRecursive(sourceDir, targetDir, true);


// Copy setup.js from src to pages-webapp
const setupSrc = path.join(__dirname, '../src/setup.js');
const setupDest = path.join(targetDir, 'setup.js');
if (fs.existsSync(setupSrc)) {
  fs.copyFileSync(setupSrc, setupDest);
  console.log('setup.js copied from src to pages-webapp');
} else {
  console.warn('Warning: setup.js not found in src directory');
}


console.log('CaseHub Pages webapp copied successfully');