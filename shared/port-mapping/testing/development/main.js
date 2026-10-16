import { total } from '/modules.js';

document.querySelector('h1').textContent = `Development app: ${total}`;
document.querySelector('#load').onclick = async () => {
  const name = 'lazy';
  const [first, second] = await Promise.all([import('./lazy.js'), import(`./${name}.js`)]);
  document.querySelector('#result').textContent = first.label + ' / ' + second.label;
};
