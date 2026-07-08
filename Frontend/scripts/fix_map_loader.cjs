const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/vivek/Desktop/AppZeto/Rogas/Indian-Foods/Frontend/src';

function walkSync(currentDirPath, callback) {
    fs.readdirSync(currentDirPath).forEach(function (name) {
        var filePath = path.join(currentDirPath, name);
        var stat = fs.statSync(filePath);
        if (stat.isFile()) {
            if (filePath.endsWith('.jsx') || filePath.endsWith('.js')) {
                callback(filePath, stat);
            }
        } else if (stat.isDirectory()) {
            walkSync(filePath, callback);
        }
    });
}

walkSync(dir, function(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if useJsApiLoader is imported and used
    if (content.includes('useJsApiLoader({') || content.includes('useJsApiLoader ({')) {
        let originalContent = content;
        
        // Use a regex to match useJsApiLoader({ ... }) calls and replace with standard
        // We match until we hit `});`
        const regex = /useJsApiLoader\s*\(\s*\{[\s\S]*?\}\s*\)/g;
        
        content = content.replace(regex, `useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: ["places", "drawing", "geometry"]
  })`);
        
        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Updated:', filePath);
        }
    }
});

console.log('Done!');
