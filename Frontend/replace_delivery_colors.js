import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function walkAndReplace(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkAndReplace(fullPath);
        } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js') || fullPath.endsWith('.css')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let original = content;
            
            // #ff8100 -> primary
            content = content.replace(/bg-\[\#ff8100\]/gi, 'bg-primary');
            content = content.replace(/text-\[\#ff8100\]/gi, 'text-primary');
            content = content.replace(/border-\[\#ff8100\]/gi, 'border-primary');
            content = content.replace(/from-\[\#ff8100\]/gi, 'from-primary');
            content = content.replace(/to-\[\#ff8100\]/gi, 'to-primary');
            content = content.replace(/ring-\[\#ff8100\]/gi, 'ring-primary');
            content = content.replace(/fill-\[\#ff8100\]/gi, 'fill-primary');
            content = content.replace(/stroke-\[\#ff8100\]/gi, 'stroke-primary');
            content = content.replace(/shadow-\[\#ff8100\]/gi, 'shadow-primary');
            
            content = content.replace(/focus:border-\[\#ff8100\]/gi, 'focus:border-primary');
            content = content.replace(/focus:ring-\[\#ff8100\]/gi, 'focus:ring-primary');
            
            // Replace generic hex bracket calls with 'primary'
            content = content.replace(/\[\#ff8100\]/gi, 'primary');

            // Also, replace "primary-orange" with "primary" so it maps directly to --primary instead of the legacy --color-primary-orange
            content = content.replace(/bg-primary-orange/gi, 'bg-primary');
            content = content.replace(/text-primary-orange/gi, 'text-primary');
            content = content.replace(/border-primary-orange/gi, 'border-primary');
            content = content.replace(/ring-primary-orange/gi, 'ring-primary');

            if (content !== original) {
                fs.writeFileSync(fullPath, content);
                console.log(`Updated: ${fullPath}`);
            }
        }
    }
}

walkAndReplace(path.join(__dirname, 'src', 'modules', 'DeliveryV2'));
walkAndReplace(path.join(__dirname, 'src', 'modules', 'Food', 'pages', 'restaurant'));
walkAndReplace(path.join(__dirname, 'src', 'modules', 'Food', 'components', 'restaurant'));
console.log('Done!');
