// 画面で使う小さな部品。文は textContent で入れる（HTML として解釈されない）
export function button(label, onClick) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'btn';
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}

export function heading(text) {
  const el = document.createElement('h1');
  el.textContent = text;
  return el;
}

export function note(text) {
  const el = document.createElement('p');
  el.className = 'note';
  el.textContent = text;
  return el;
}

// 安全の一言を、そろえて並べる（welcome・safety・warmup 共通）
export function safetyList(lines) {
  const ul = document.createElement('ul');
  ul.className = 'safety';
  for (const line of lines) {
    const li = document.createElement('li');
    li.textContent = line;
    ul.append(li);
  }
  return ul;
}
