
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = process.cwd();
const outputFile = path.join(rootDir, 'project_full_context.md');

// Configuration
const ignoreDirs = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.gemini',
    'coverage',
    '.vscode',
    '.idea'
];

const ignoreFiles = [
    'finance.db',
    'finance.db-journal',
    'package-lock.json',
    'yarn.lock',
    '.DS_Store',
    'project_full_context.md',
    '.env',
    '.env.local' // Exclude secrets for safety
];

const binaryExts = [
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
    '.pdf', '.db', '.sqlite', '.exe', '.dll', '.bin'
];

function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            if (!ignoreDirs.includes(file)) {
                getAllFiles(filePath, fileList);
            }
        } else {
            const ext = path.extname(file).toLowerCase();
            if (!ignoreFiles.includes(file) && !binaryExts.includes(ext)) {
                fileList.push(filePath);
            }
        }
    });

    return fileList;
}

console.log(`Scanning project in: ${rootDir}`);
const files = getAllFiles(rootDir);
console.log(`Found ${files.length} text files.`);

let output = `# Project Export\n\n`;
output += `Generated on: ${new Date().toISOString()}\n`;
output += `Total Files: ${files.length}\n\n`;

// 1. File Tree
output += `## Project Structure\n\`\`\`text\n`;
files.forEach(f => {
    output += path.relative(rootDir, f).replace(/\\/g, '/') + '\n';
});
output += `\`\`\`\n\n`;

// 2. File Contents
files.forEach(f => {
    const relativePath = path.relative(rootDir, f).replace(/\\/g, '/');
    let ext = path.extname(f).substring(1);

    // Map extensions to markdown languages
    if (ext === 'js' || ext === 'jsx') ext = 'javascript';
    if (ext === 'ts' || ext === 'tsx') ext = 'typescript';
    if (ext === 'md') ext = 'markdown';
    if (ext === '') ext = 'text';

    let content = "";
    try {
        content = fs.readFileSync(f, 'utf8');
    } catch (e) {
        content = `[Error reading file: ${e.message}]`;
    }

    output += `## File: ${relativePath}\n`;
    output += `\`\`\`${ext}\n`;
    output += content + '\n';
    output += `\`\`\`\n\n---\n\n`;
});

fs.writeFileSync(outputFile, output);
console.log(`Successfully exported to: ${outputFile}`);
