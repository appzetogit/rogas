import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const walkSync = (dir, filelist = []) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filepath = path.join(dir, file);
        if (fs.statSync(filepath).isDirectory()) {
            if (filepath.includes('node_modules') || filepath.includes('.git') || filepath.includes('dist')) continue;
            filelist = walkSync(filepath, filelist);
        } else {
            if (filepath.endsWith('.js') || filepath.endsWith('.jsx')) {
                filelist.push(filepath);
            }
        }
    }
    return filelist;
};

const frontendDir = path.resolve(__dirname, '../../Frontend/src');
const backendDir = path.resolve(__dirname, '../../Backend/src');

const allFiles = [...walkSync(frontendDir), ...walkSync(backendDir)];

let changedFiles = 0;

allFiles.forEach(filepath => {
    let content = fs.readFileSync(filepath, 'utf8');
    const originalContent = content;

    // Replacements
    content = content.replace(/\|\|\s*'Vendor'/g, "|| ''");
    content = content.replace(/\|\|\s*"Vendor"/g, '|| ""');
    content = content.replace(/\|\|\s*'Customer'/g, "|| ''");
    content = content.replace(/\|\|\s*"Customer"/g, '|| ""');
    
    // Replace complex ones
    content = content.replace(/\|\|\s*\(\s*isPickup\s*\?\s*'Vendor'\s*:\s*'Customer'\s*\)/g, "|| ''");
    content = content.replace(/\(\s*isPickup\s*\?\s*'Vendor'\s*:\s*'Customer'\s*\)/g, "''");

    if (content !== originalContent) {
        fs.writeFileSync(filepath, content, 'utf8');
        console.log('Modified:', filepath);
        changedFiles++;
    }
});

console.log(`Done. Modified ${changedFiles} files.`);
