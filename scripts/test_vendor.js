const fs = require('fs');
const html = fs.readFileSync('tests/audit.test.html', 'utf8');
const scriptStart = html.indexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
let code = html.substring(scriptStart + 8, scriptEnd);

global.document = {
  getElementById: () => ({ appendChild: () => {}, set innerHTML(v) {} }),
  createElement: () => ({ style: {}, set innerHTML(v) {} })
};

eval(code);

let raw = 'Metro Cash & Carry';
console.log('Input:', raw);
let s = raw.toLowerCase().trim();
console.log('step 1:', s);
s = s.replace(/&/g, ' and ');
s = s.replace(/[.,\-:;'"\/\\()\[\]{}!@#$%^*+=?<>_]/g, ' ');
s = s.replace(/\s+/g, ' ').trim();
console.log('step 3 normalized spaces:', s);

const suffixes = ['cash and carry', 'traders'];
for (const suf of suffixes) {
  const reg = new RegExp(`\\b${suf}\\b`, 'gi');
  console.log(`regex for "${suf}":`, reg, 'matches?', reg.test(s));
  s = s.replace(reg, ' ');
}
console.log('step 4:', s);
console.log('final:', s.replace(/\s+/g, ' ').trim());
