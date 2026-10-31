// モーダル（小さな画面）とトースト（短いお知らせ）

import { escapeHtml } from './util.js';

let toastTimer = null;

export function toast(msg, ms = 2500) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast hidden';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

// buttons: [{ label, value, primary }]
// 戻り値: 押されたボタンの value（input があれば { value, input }）
// onOpen(el, close): 中身のボタンなどに自分で動きをつけたいとき / className: モーダルに付ける追加のクラス
export function showModal({ title = '', html = '', buttons = [{ label: 'OK', value: true, primary: true }], input = null, onOpen = null, className = '' }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal ${className}" role="dialog" aria-modal="true">
        ${title ? `<h2>${escapeHtml(title)}</h2>` : ''}
        <div class="modal-body">${html}</div>
        ${input ? `<input class="modal-input" type="text" maxlength="${input.maxlength || 40}" placeholder="${escapeHtml(input.placeholder || '')}" value="${escapeHtml(input.value || '')}">
        <div class="modal-error"></div>` : ''}
        <div class="modal-buttons">
          ${buttons.map((b, i) => `<button data-i="${i}" class="${b.primary ? 'primary' : ''}">${escapeHtml(b.label)}</button>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(back);
    const inp = back.querySelector('.modal-input');
    const err = back.querySelector('.modal-error');
    if (inp) setTimeout(() => inp.focus(), 50);

    const finish = (b) => {
      if (inp && b.primary && input.validate) {
        const msg = input.validate(inp.value.trim());
        if (msg) { err.textContent = msg; return; }
      }
      back.remove();
      resolve(inp ? { value: b.value, input: inp.value.trim() } : b.value);
    };
    back.querySelectorAll('.modal-buttons button').forEach((btn) => {
      btn.addEventListener('click', () => finish(buttons[Number(btn.dataset.i)]));
    });
    if (onOpen) {
      onOpen(back, (value) => { back.remove(); resolve(value); });
    }
    if (inp) {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const primary = buttons.find((b) => b.primary) || buttons[0];
          finish(primary);
        }
      });
    }
  });
}

export function confirmModal(text, okLabel = 'はい', cancelLabel = 'いいえ') {
  return showModal({
    html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`,
    buttons: [
      { label: cancelLabel, value: false },
      { label: okLabel, value: true, primary: true },
    ],
  });
}
