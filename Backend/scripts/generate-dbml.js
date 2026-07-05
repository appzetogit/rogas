import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function findModelFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      await findModelFiles(filePath, fileList);
    } else if (filePath.endsWith('.model.js')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

async function generateDBML() {
  const srcDir = path.join(__dirname, '..', 'src');
  const modelFiles = await findModelFiles(srcDir);

  for (const file of modelFiles) {
    try {
      await import(pathToFileURL(file).href);
    } catch (e) {}
  }

  let dbmlCode = '';
  const models = mongoose.modelNames();
  
  for (const modelName of models) {
    const schema = mongoose.model(modelName).schema;
    const cleanModelName = modelName.replace(/[^a-zA-Z0-9_]/g, '');
    dbmlCode += `Table ${cleanModelName} {\n`;
    
    for (const [pathName, schemaType] of Object.entries(schema.paths)) {
        if (pathName === '__v') continue;
        let typeStr = schemaType.instance || 'Object';
        
        // Handle arrays and refs for type naming
        if (schemaType.options && schemaType.options.type) {
           if (Array.isArray(schemaType.options.type)) {
               typeStr = `Array_${schemaType.caster ? schemaType.caster.instance : 'Mixed'}`;
           }
        }
        
        // Clean types and names for DBML
        typeStr = typeStr.replace(/[^a-zA-Z0-9_]/g, '');
        const cleanPathName = pathName.replace(/[^a-zA-Z0-9_]/g, '_');
        
        // Ensure quotes if there are issues, but DBML usually prefers raw names if they don't have spaces
        dbmlCode += `  ${cleanPathName} ${typeStr || 'Any'}\n`;
    }
    dbmlCode += `}\n\n`;
  }

  // Add Relationships
  for (const modelName of models) {
    const schema = mongoose.model(modelName).schema;
    const cleanModelName = modelName.replace(/[^a-zA-Z0-9_]/g, '');
    for (const [pathName, schemaType] of Object.entries(schema.paths)) {
        let ref = null;
        if (schemaType.options && schemaType.options.ref) {
            ref = schemaType.options.ref;
        } else if (schemaType.caster && schemaType.caster.options && schemaType.caster.options.ref) {
            ref = schemaType.caster.options.ref;
        }
        
        if (ref && mongoose.modelNames().includes(ref)) {
            const cleanRef = ref.replace(/[^a-zA-Z0-9_]/g, '');
            const cleanPathName = pathName.replace(/[^a-zA-Z0-9_]/g, '_');
            dbmlCode += `Ref: ${cleanModelName}.${cleanPathName} > ${cleanRef}._id\n`;
        }
    }
  }

  const outputPath = path.join(__dirname, '..', 'db_diagram.dbml');
  fs.writeFileSync(outputPath, dbmlCode);
  console.log(`DBML diagram generated at ${outputPath}`);
}

generateDBML().catch(console.error);
