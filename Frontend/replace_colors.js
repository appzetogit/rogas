import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function walkAndReplace(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkAndReplace(fullPath);
        } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js') || fullPath.endsWith('.css')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let original = content;
            
            // Primary (#7e3866) replacements
            content = content.replace(/bg-\[\#7e3866\]/gi, 'bg-primary');
            content = content.replace(/text-\[\#7e3866\]/gi, 'text-primary');
            content = content.replace(/border-\[\#7e3866\]/gi, 'border-primary');
            content = content.replace(/from-\[\#7e3866\]/gi, 'from-primary');
            content = content.replace(/to-\[\#7e3866\]/gi, 'to-primary');
            content = content.replace(/ring-\[\#7e3866\]/gi, 'ring-primary');
            content = content.replace(/fill-\[\#7e3866\]/gi, 'fill-primary');
            content = content.replace(/shadow-\[\#7e3866\]/gi, 'shadow-primary');
            
            // Secondary (#55254b) replacements
            content = content.replace(/bg-\[\#55254b\]/gi, 'bg-secondary');
            content = content.replace(/text-\[\#55254b\]/gi, 'text-secondary');
            content = content.replace(/border-\[\#55254b\]/gi, 'border-secondary');
            content = content.replace(/from-\[\#55254b\]/gi, 'from-secondary');
            content = content.replace(/to-\[\#55254b\]/gi, 'to-secondary');
            content = content.replace(/ring-\[\#55254b\]/gi, 'ring-secondary');
            content = content.replace(/fill-\[\#55254b\]/gi, 'fill-secondary');
            content = content.replace(/shadow-\[\#55254b\]/gi, 'shadow-secondary');
            
            // Also replace direct style colors in style tags or standard attributes
            // Careful not to replace it if it's already in a class like hover:bg-[#7e3866]
            content = content.replace(/hover:bg-\[\#7e3866\]/gi, 'hover:bg-primary');
            content = content.replace(/hover:text-\[\#7e3866\]/gi, 'hover:text-primary');
            content = content.replace(/hover:border-\[\#7e3866\]/gi, 'hover:border-primary');
            
            content = content.replace(/hover:bg-\[\#55254b\]/gi, 'hover:bg-secondary');
            content = content.replace(/hover:text-\[\#55254b\]/gi, 'hover:text-secondary');
            content = content.replace(/hover:border-\[\#55254b\]/gi, 'hover:border-secondary');
            
            content = content.replace(/focus:border-\[\#7e3866\]/gi, 'focus:border-primary');
            content = content.replace(/focus:ring-\[\#7e3866\]/gi, 'focus:ring-primary');
            
            content = content.replace(/dark:text-\[\#7e3866\]/gi, 'dark:text-primary');
            content = content.replace(/dark:bg-\[\#7e3866\]/gi, 'dark:bg-primary');
            content = content.replace(/dark:border-\[\#7e3866\]/gi, 'dark:border-primary');
            content = content.replace(/dark:hover:bg-\[\#55254b\]/gi, 'dark:hover:bg-secondary');
            content = content.replace(/dark:hover:text-\[\#55254b\]/gi, 'dark:hover:text-secondary');
            
            // Replace remaining straggler styles for arbitrary tailwind, e.g. text-[#7e3866]/50
            // Instead of regexing all, we can just replace '[#7e3866]' with 'primary' in valid tailwind patterns
            content = content.replace(/\[\#7e3866\]/gi, 'primary');
            content = content.replace(/\[\#55254b\]/gi, 'secondary');

            if (content !== original) {
                fs.writeFileSync(fullPath, content);
                console.log(`Updated: ${fullPath}`);
            }
        }
    }
}

walkAndReplace(path.join(__dirname, 'src'));
console.log('Done!');
