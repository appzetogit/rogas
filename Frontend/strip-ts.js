import fs from 'fs';
import path from 'path';
import { transformSync } from 'esbuild';

const srcDir = 'src/modules/DeliveryV2/newUI';
const files = fs.readdirSync(srcDir);

for (const file of files) {
  if (file.endsWith('.tsx') || file.endsWith('.ts')) {
    const filePath = path.join(srcDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    try {
      const result = transformSync(content, {
        loader: file.endsWith('.tsx') ? 'tsx' : 'ts',
        format: 'esm',
        jsx: 'preserve',
      });
      const newExt = file.endsWith('.tsx') ? '.jsx' : '.js';
      const newPath = path.join(srcDir, file.replace(/\.tsx?$/, newExt));
      fs.writeFileSync(newPath, result.code);
      fs.unlinkSync(filePath);
      console.log(`Converted ${file} to ${newExt}`);
    } catch (e) {
      console.error(`Failed to convert ${file}:`, e);
    }
  }
}
