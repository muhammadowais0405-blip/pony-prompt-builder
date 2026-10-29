const fs = require('fs');
const glob = require('glob');

const files = [
  'src/components/CenterColumn.jsx',
  'src/components/LeftSidebar.jsx',
  'src/components/RightColumn.jsx',
  'src/components/TrashPanel.jsx',
  'src/index.css'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  // replace var(--text-white) with var(--text-primary)
  content = content.replace(/var\(--text-white\)/g, 'var(--text-primary)');
  
  // replace #fff with var(--text-primary) where it makes sense (not in buttons)
  if (file.includes('RightColumn.jsx')) {
    content = content.replace(/<p className="text-xs font-bold" style={{ color: '#fff' }}>\{tag\}<\/p>/g,
      `<p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{tag}</p>`);
  }
  if (file.includes('CenterColumn.jsx')) {
    content = content.replace(/color: '#fff'/g, "color: 'var(--text-primary)'");
  }
  fs.writeFileSync(file, content);
}
console.log('Replaced text-white');
