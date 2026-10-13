// Injects the system bars and the navigation bar so each mockup only holds its own screen.
const ICONS = 'assets/icons.svg';
window.icon = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="${ICONS}#${name}"/></svg>`;

document.querySelectorAll('[data-icon]').forEach((el) => {
  el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon, el.dataset.iconClass || ''));
});

document.querySelectorAll('.phone').forEach((phone) => {
  const status = phone.dataset.status ?? 'ground';
  phone.insertAdjacentHTML(
    'afterbegin',
    `<div class="statusbar" style="${status === 'deck' ? 'background:var(--deck);color:var(--on-deck)' : status === 'none' ? 'position:absolute;top:0;left:0;right:0;color:#fff' : ''}">
      <span class="num">9:41</span><span class="sys"><b></b><b style="width:16px"></b><b style="width:22px;border-radius:3px"></b></span></div>`,
  );
  const tab = phone.dataset.tab;
  if (tab) {
    const tabs = [
      ['grab', 'Grab', 'link'],
      ['activity', 'Activity', 'pulse'],
      ['library', 'Library', 'images'],
      ['server', 'Server', 'hard-drives'],
      ['settings', 'Settings', 'gear'],
    ];
    const badge = phone.dataset.badge;
    phone.insertAdjacentHTML(
      'beforeend',
      `<nav class="navbar">${tabs
        .map(
          ([key, label, ic]) =>
            `<div class="${key === tab ? 'on' : ''}"><span class="ind">${icon(key === tab ? `${ic}-fill` : ic)}${
              key === 'activity' && badge ? `<span class="badge num">${badge}</span>` : ''
            }</span>${label}</div>`,
        )
        .join('')}</nav>`,
    );
  }
  if (phone.dataset.gesture !== 'none') phone.insertAdjacentHTML('beforeend', '<div class="gesturebar"></div>');
});
