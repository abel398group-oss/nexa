/* @ds-bundle: {"format":3,"namespace":"HiperTMSDesignSystem_0aa560","components":[{"name":"MetricCard","sourcePath":"components/app/MetricCard.jsx"},{"name":"StatusBadge","sourcePath":"components/app/StatusBadge.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Checkbox","sourcePath":"components/core/Checkbox.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Select","sourcePath":"components/core/Select.jsx"},{"name":"Switch","sourcePath":"components/core/Switch.jsx"},{"name":"Avatar","sourcePath":"components/data/Avatar.jsx"},{"name":"DataTable","sourcePath":"components/data/DataTable.jsx"},{"name":"Pagination","sourcePath":"components/navigation/Pagination.jsx"},{"name":"Sidebar","sourcePath":"components/navigation/Sidebar.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"Dialog","sourcePath":"components/overlay/Dialog.jsx"},{"name":"Toast","sourcePath":"components/overlay/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/overlay/Tooltip.jsx"}],"sourceHashes":{"account-profile.js":"4361159cf69c","app-shell.js":"a1da34d34d9e","components/app/MetricCard.jsx":"f247ecf04bee","components/app/StatusBadge.jsx":"9df009b65aaa","components/core/Badge.jsx":"b1755eae661e","components/core/Button.jsx":"88c3ee48ff57","components/core/Card.jsx":"afa873798472","components/core/Checkbox.jsx":"5a22b6f0249b","components/core/Input.jsx":"2305a94e0a2c","components/core/Select.jsx":"00ee534ea42b","components/core/Switch.jsx":"2c800af27e58","components/data/Avatar.jsx":"fd40af3c6d3b","components/data/DataTable.jsx":"02b0b5d7c8d4","components/navigation/Pagination.jsx":"410ce2d7f893","components/navigation/Sidebar.jsx":"32a3b5a5f8eb","components/navigation/Tabs.jsx":"aa36361a0d07","components/overlay/Dialog.jsx":"463b6645f273","components/overlay/Toast.jsx":"1954293e9d69","components/overlay/Tooltip.jsx":"ad830d6839d9","dashboard-app.js":"c5be197bf9b9","design-canvas.jsx":"bd8746af6e58","detail-cte.js":"9590ee415f55","detail-quote.js":"621156d31136","detail-trip.js":"08aa90a101aa","directory-clients.js":"46c057667be6","finance-account-form.js":"65ee16ea16d9","fiscal-cte-list.js":"8097cbdb6388","fleet-vehicles-list.js":"607ffdeb6aac","handoff_hipertms/03-dashboard/dashboard-app.js":"c5be197bf9b9","handoff_hipertms/04-directory/app-shell.js":"a1da34d34d9e","handoff_hipertms/04-directory/directory-clients.js":"46c057667be6","handoff_hipertms/05-finance/app-shell.js":"a1da34d34d9e","handoff_hipertms/05-finance/finance-account-form.js":"65ee16ea16d9","handoff_hipertms/06-fiscal/app-shell.js":"a1da34d34d9e","handoff_hipertms/06-fiscal/fiscal-cte-list.js":"8097cbdb6388","handoff_hipertms/07-fleet/app-shell.js":"a1da34d34d9e","handoff_hipertms/07-fleet/fleet-vehicles-list.js":"607ffdeb6aac","handoff_hipertms/08-logistics/app-shell.js":"a1da34d34d9e","handoff_hipertms/08-logistics/logistics-quotes-list.js":"d4328a5c0e90","handoff_hipertms/09-pricing/app-shell.js":"a1da34d34d9e","handoff_hipertms/09-pricing/pricing-tables-list.js":"6400637792b4","handoff_hipertms/10-platform-admin/app-shell.js":"a1da34d34d9e","handoff_hipertms/10-platform-admin/platform-tenants-list.js":"4644645215da","handoff_hipertms/11-tenant-admin/app-shell.js":"a1da34d34d9e","handoff_hipertms/11-tenant-admin/tenant-users-list.js":"f9bd0bf02436","handoff_hipertms/12-work/app-shell.js":"a1da34d34d9e","handoff_hipertms/12-work/work-tasks-list.js":"6fe41ec74d1e","handoff_hipertms/13-procurement/app-shell.js":"a1da34d34d9e","handoff_hipertms/13-procurement/procurement-orders-list.js":"60765a381f42","handoff_hipertms/14-account/account-profile.js":"4361159cf69c","handoff_hipertms/14-account/app-shell.js":"a1da34d34d9e","handoff_hipertms_detalhes/app-shell.js":"a1da34d34d9e","handoff_hipertms_detalhes/detail-cte.js":"9590ee415f55","handoff_hipertms_detalhes/detail-quote.js":"621156d31136","handoff_hipertms_detalhes/detail-trip.js":"08aa90a101aa","logistics-quotes-list.js":"d4328a5c0e90","logos.jsx":"a5869237c259","platform-tenants-list.js":"4644645215da","pricing-tables-list.js":"6400637792b4","procurement-orders-list.js":"60765a381f42","slides/deck-stage.js":"9436a2deeb46","tenant-users-list.js":"f9bd0bf02436","ui_kits/app/screens-admin.jsx":"e6d1dc16a06d","ui_kits/app/screens-fiscal.jsx":"1fc886434222","ui_kits/app/screens-main.jsx":"c886f2fe9ce5","ui_kits/app/screens-onboarding.jsx":"950f88666c95","ui_kits/app/screens-ops.jsx":"16175420ed0d","ui_kits/app/screens-quotes.jsx":"7de3f39c0e6a","ui_kits/app/shell.jsx":"46839b5b5f13","ui_kits/marketing/sections.jsx":"8d81cd813be4","work-tasks-list.js":"6fe41ec74d1e"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.HiperTMSDesignSystem_0aa560 = window.HiperTMSDesignSystem_0aa560 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// account-profile.js
try { (() => {
/* global window */
// Conta · Minha Conta — settings/profile form on the shared shell. `ico` is global.

const content = `
<div class="page form-wrap" data-screen-label="Minha Conta">
  <div class="page-head">
    <div class="ph-icon">${ico('userCircle', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Sistema <span>›</span> Minha Conta</p>
      <h1 class="ph-title">Minha Conta</h1>
      <p class="ph-desc">Seus dados de perfil, preferências e segurança da conta.</p>
    </div>
  </div>

  <div class="form-card">
    <div class="form-section-head"><h3>Perfil</h3><p>Como você aparece para a sua equipe.</p></div>
    <div class="form-body">
      <div class="profile-row">
        <span class="profile-avatar">FO</span>
        <div class="profile-meta">
          <p class="profile-name">Fábio Ogawa</p>
          <p class="profile-mail">fabio@transportadoramodelo.com.br</p>
          <div class="profile-actions"><button class="btn btn-outline">Alterar foto</button><button class="btn btn-soft">Remover</button></div>
        </div>
      </div>
      <div class="form-grid" style="margin-top:20px">
        <div class="field"><label>Nome completo <span class="req">*</span></label><input type="text" value="Fábio Ogawa" /></div>
        <div class="field"><label>Cargo</label><input type="text" value="Administrador" /></div>
        <div class="field"><label>Email <span class="req">*</span></label><input type="email" value="fabio@transportadoramodelo.com.br" /></div>
        <div class="field"><label>Telefone</label><input type="tel" value="(41) 99876-5432" /></div>
      </div>
    </div>
  </div>

  <div class="form-card">
    <div class="form-section-head"><h3>Preferências</h3><p>Idioma, fuso e notificações.</p></div>
    <div class="form-body">
      <div class="form-grid">
        <div class="field"><label>Idioma</label><select><option>Português (Brasil)</option><option>English (US)</option><option>Español</option></select></div>
        <div class="field"><label>Fuso horário</label><select><option>(GMT-03:00) Brasília</option><option>(GMT-04:00) Cuiabá</option><option>(GMT-05:00) Acre</option></select></div>
      </div>
      <div class="toggle-list">
        <div class="toggle-row"><div><p class="tg-title">Notificações por email</p><p class="tg-desc">Resumos diários e alertas de pendências da operação.</p></div><span class="switch on" role="switch"></span></div>
        <div class="toggle-row"><div><p class="tg-title">Alertas de vencimento</p><p class="tg-desc">CNH, licenciamento, manutenção e exames da frota.</p></div><span class="switch on" role="switch"></span></div>
        <div class="toggle-row"><div><p class="tg-title">Novidades do produto</p><p class="tg-desc">Avisos ocasionais sobre novos recursos.</p></div><span class="switch" role="switch"></span></div>
      </div>
    </div>
  </div>

  <div class="form-card">
    <div class="form-section-head"><h3>Segurança</h3><p>Senha e autenticação.</p></div>
    <div class="form-body">
      <div class="form-grid">
        <div class="field"><label>Senha atual</label><input type="password" placeholder="••••••••" /></div>
        <div class="field"><!-- spacer --></div>
        <div class="field"><label>Nova senha</label><input type="password" placeholder="••••••••" /></div>
        <div class="field"><label>Confirmar nova senha</label><input type="password" placeholder="••••••••" /></div>
      </div>
      <div class="toggle-list" style="margin-top:4px">
        <div class="toggle-row"><div><p class="tg-title">Verificação em duas etapas (2FA)</p><p class="tg-desc">Camada extra de segurança no login.</p></div><button class="btn btn-outline">Ativar</button></div>
      </div>
    </div>
  </div>

  <div class="form-actions">
    <button class="btn btn-outline">Cancelar</button>
    <button class="btn btn-primary">Salvar alterações</button>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Minha Conta',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "account-profile.js", error: String((e && e.message) || e) }); }

// app-shell.js
try { (() => {
/* global window, document */
// HiperTMS shared app shell — window.AppShell.renderShell({ activeLabel, content }) + icons.

const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  docDup: '<rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h6"/>',
  map: '<path d="m9 5-6 2.4V20l6-2.4 6 2.4 6-2.4V5l-6 2.4z"/><path d="M9 5v12.6M15 7.4V20"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6 6 0 0 1 11.6 0"/>',
  store: '<path d="M2 7l1.5-3h17L22 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M16 6l2 2M19 3l2 2"/>',
  bolt: '<path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  dots: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'
};
function ico(name, cls) {
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const QUICK = [['doc', 'Cotações'], ['truck', 'Embarques'], ['clipboard', 'Cargas'], ['map', 'Viagens'], ['doc', 'CT-e'], ['docDup', 'MDF-e']];
const HUBS = [['trending', 'Vendas'], ['truck', 'Operação'], ['building', 'Cadastros'], ['wrench', 'Frota'], ['cart', 'Compras'], ['wallet', 'Financeiro'], ['users', 'Equipes'], ['layers', 'Precificação']];
const SYSTEM = [['chart', 'Administração'], ['userCircle', 'Minha Conta'], ['store', 'Dados da Empresa'], ['users', 'Usuários'], ['card', 'Assinatura e Cobrança'], ['wrench', 'Configuração da operação'], ['key', 'Sequenciadores'], ['bolt', 'Automação']];
function navRow(icon, label, active) {
  return `<button class="navrow${active ? ' active' : ''}" type="button">
    <span class="navicon">${active ? '<span class="dot"></span>' : ''}${ico(icon, 'ic5')}</span>
    <span class="navlabel">${label}</span>
  </button>`;
}
function renderShell({
  activeLabel = '',
  content = ''
} = {}) {
  const sidebar = `
  <aside class="sidebar">
    <div class="sb-head"><span class="wm"><span class="h">Hiper</span><span class="t">TMS</span></span></div>
    <div class="sb-scroll">
      <p class="sb-grouplabel">Acesso rápido</p>
      ${QUICK.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
      <div class="sb-divider"></div>
      ${HUBS.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
    </div>
    <div class="sb-foot">
      <button class="navrow sys-toggle" type="button" id="sys-toggle">
        <span class="navicon">${ico('chart', 'ic5')}</span><span class="navlabel">Sistema</span><span class="navchev">${ico('chevD', 'ic4')}</span>
      </button>
      <div class="sys-items" id="sys-items">${SYSTEM.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}</div>
      <div class="sb-version">HiperTMS v12</div>
    </div>
  </aside>`;
  const topbar = `
  <header class="topbar">
    <div class="tb-left"><button class="tenant"><span class="tenant-logo">TM</span><span class="tenant-name">Transportadora Modelo LTDA</span>${ico('chevR', 'ic4 muted')}</button></div>
    <div class="tb-center">${ico('calendar', 'ic4 muted')}<span class="dt"><span>Segunda-feira</span><span class="sep">|</span><span class="nums">09/06/2026</span><span class="sep">·</span><span class="nums">14:30</span></span></div>
    <div class="tb-right">
      <button class="iconbtn">${ico('chat', 'ic5')}</button>
      <button class="iconbtn">${ico('bell', 'ic5')}<span class="reddot"></span></button>
      <button class="iconbtn">${ico('moon', 'ic5')}</button>
      <button class="avatar">FO</button>
    </div>
  </header>`;
  return `<div class="shell">${sidebar}<div class="main">${topbar}<div class="scrollarea">${content}</div></div></div>`;
}
function mountShell(rootId, opts) {
  document.getElementById(rootId).innerHTML = renderShell(opts);
  const st = document.getElementById('sys-toggle');
  if (st) st.addEventListener('click', () => {
    document.getElementById('sys-items').classList.toggle('open');
    st.classList.toggle('expanded');
  });
}
window.AppShell = {
  ICONS,
  ico,
  renderShell,
  mountShell
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "app-shell.js", error: String((e && e.message) || e) }); }

// components/app/MetricCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * MetricCard — dashboard KPI tile. Label, big tabular value, optional trend
 * pill and a footer link. Mirrors the in-app dashboard section cards.
 */
function MetricCard({
  label,
  value,
  icon = null,
  trend,
  trendValue,
  footer,
  className = '',
  style = {},
  ...props
}) {
  const up = trend === 'up';
  const trendColor = up ? 'var(--color-success)' : 'var(--color-danger)';
  return /*#__PURE__*/React.createElement("div", _extends({
    className: className,
    style: {
      background: 'var(--color-surface-raised)',
      border: '1px solid var(--color-surface-border)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-card)',
      padding: 20,
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-fg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      ...style
    }
  }, props), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--color-fg-muted)',
      fontWeight: 'var(--font-weight-medium)'
    }
  }, label), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--color-fg-subtle)',
      display: 'inline-flex'
    }
  }, icon)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 28,
      fontWeight: 'var(--font-weight-semibold)',
      fontVariantNumeric: 'tabular-nums',
      lineHeight: 1
    }
  }, value), trend && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 2,
      fontSize: 13,
      fontWeight: 'var(--font-weight-semibold)',
      color: trendColor
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true
  }, up ? '▲' : '▼'), trendValue)), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--color-fg-muted)'
    }
  }, footer));
}
Object.assign(__ds_scope, { MetricCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/app/MetricCard.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — small status / category pill. Soft tinted fills by default
 * (matching the app's status pills); `solid` and `outline` styles too.
 */
function Badge({
  variant = 'neutral',
  appearance = 'soft',
  size = 'md',
  className = '',
  style = {},
  children,
  ...props
}) {
  const tints = {
    neutral: {
      tint: 'var(--color-neutral-tint)',
      ink: 'var(--color-neutral-ink)',
      solid: 'var(--color-ink-800)'
    },
    primary: {
      tint: 'var(--color-primary-100)',
      ink: 'var(--color-primary-700)',
      solid: 'var(--color-primary)'
    },
    success: {
      tint: 'var(--color-success-tint)',
      ink: 'var(--color-success-ink)',
      solid: 'var(--color-success)'
    },
    warning: {
      tint: 'var(--color-warning-tint)',
      ink: 'var(--color-warning-ink)',
      solid: 'var(--color-warning)'
    },
    danger: {
      tint: 'var(--color-danger-tint)',
      ink: 'var(--color-danger-ink)',
      solid: 'var(--color-danger)'
    },
    info: {
      tint: 'var(--color-info-tint)',
      ink: 'var(--color-info-ink)',
      solid: 'var(--color-info)'
    }
  };
  const c = tints[variant] || tints.neutral;
  const looks = {
    soft: {
      background: c.tint,
      color: c.ink,
      border: '1px solid transparent'
    },
    solid: {
      background: c.solid,
      color: variant === 'primary' ? 'var(--color-primary-content)' : '#fff',
      border: '1px solid transparent'
    },
    outline: {
      background: 'transparent',
      color: c.ink,
      border: '1px solid color-mix(in oklab, ' + 'currentColor 35%, transparent)'
    }
  };
  const l = looks[appearance] || looks.soft;
  const sz = size === 'sm' ? {
    fontSize: 10,
    padding: '1px 7px',
    gap: 4
  } : {
    fontSize: 12,
    padding: '3px 10px',
    gap: 5
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    className: className,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: sz.gap,
      padding: sz.padding,
      fontSize: sz.fontSize,
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--font-weight-semibold)',
      lineHeight: 1.4,
      borderRadius: 'var(--radius-full)',
      whiteSpace: 'nowrap',
      ...l,
      ...style
    }
  }, props), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/app/StatusBadge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * StatusBadge — maps a HiperTMS domain status (quote / shipment / fiscal) to
 * the right tinted Badge with a PT-BR label and status dot.
 */
const STATUS_MAP = {
  // Cotações
  rascunho: {
    label: 'Rascunho',
    variant: 'neutral'
  },
  em_cotacao: {
    label: 'Em cotação',
    variant: 'primary'
  },
  enviada: {
    label: 'Enviada',
    variant: 'info'
  },
  aprovada: {
    label: 'Aprovada',
    variant: 'success'
  },
  rejeitada: {
    label: 'Rejeitada',
    variant: 'danger'
  },
  convertida: {
    label: 'Convertida',
    variant: 'info'
  },
  // Embarques / viagens
  pendente: {
    label: 'Pendente',
    variant: 'warning'
  },
  em_transito: {
    label: 'Em trânsito',
    variant: 'primary'
  },
  entregue: {
    label: 'Entregue',
    variant: 'success'
  },
  cancelado: {
    label: 'Cancelado',
    variant: 'danger'
  },
  // Fiscal (CT-e / MDF-e)
  autorizado: {
    label: 'Autorizado',
    variant: 'success'
  },
  processando: {
    label: 'Processando',
    variant: 'warning'
  },
  rejeitado: {
    label: 'Rejeitado',
    variant: 'danger'
  },
  encerrado: {
    label: 'Encerrado',
    variant: 'neutral'
  }
};
function StatusBadge({
  status,
  label,
  appearance = 'soft',
  size = 'md',
  dot = true,
  ...props
}) {
  const key = String(status || '').toLowerCase().replace(/[\s-]+/g, '_');
  const entry = STATUS_MAP[key] || {
    label: label || status,
    variant: 'neutral'
  };
  const dotColor = {
    neutral: 'var(--color-neutral-ink)',
    primary: 'var(--color-primary)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    danger: 'var(--color-danger)',
    info: 'var(--color-info)'
  }[entry.variant];
  return /*#__PURE__*/React.createElement(__ds_scope.Badge, _extends({
    variant: entry.variant,
    appearance: appearance,
    size: size
  }, props), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: dotColor,
      flexShrink: 0
    },
    "aria-hidden": true
  }), label || entry.label);
}
Object.assign(__ds_scope, { StatusBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/app/StatusBadge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — HiperTMS primary action control.
 * Filled "Laranja-Ignição" primary, plus secondary / outline / ghost / link
 * and semantic destructive / success. Mirrors the shadcn button used in-app.
 */
function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  className = '',
  style = {},
  children,
  ...props
}) {
  const sizes = {
    xs: {
      height: 24,
      padding: '0 8px',
      fontSize: 12,
      gap: 4,
      radius: 'var(--radius-md)'
    },
    sm: {
      height: 32,
      padding: '0 12px',
      fontSize: 13,
      gap: 6,
      radius: 'var(--radius-md)'
    },
    md: {
      height: 36,
      padding: '0 16px',
      fontSize: 14,
      gap: 8,
      radius: 'var(--radius-md)'
    },
    lg: {
      height: 40,
      padding: '0 24px',
      fontSize: 15,
      gap: 8,
      radius: 'var(--radius-md)'
    },
    icon: {
      height: 36,
      width: 36,
      padding: 0,
      fontSize: 14,
      gap: 0,
      radius: 'var(--radius-md)'
    }
  };
  const s = sizes[size] || sizes.md;
  const variants = {
    primary: {
      background: 'var(--color-primary)',
      color: 'var(--color-primary-content)',
      border: '1px solid transparent',
      boxShadow: 'var(--shadow-soft)',
      '--hover-bg': 'var(--color-primary-dark)'
    },
    secondary: {
      background: 'var(--color-base-200)',
      color: 'var(--color-fg)',
      border: '1px solid transparent',
      '--hover-bg': 'var(--color-base-300)'
    },
    outline: {
      background: 'var(--color-surface-raised)',
      color: 'var(--color-fg)',
      border: '1px solid var(--color-surface-border)',
      boxShadow: 'var(--shadow-soft)',
      '--hover-bg': 'var(--color-base-200)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-fg)',
      border: '1px solid transparent',
      '--hover-bg': 'var(--color-base-200)'
    },
    destructive: {
      background: 'var(--color-danger)',
      color: '#fff',
      border: '1px solid transparent',
      boxShadow: 'var(--shadow-soft)',
      '--hover-bg': 'var(--color-danger-dark)'
    },
    success: {
      background: 'var(--color-success)',
      color: '#fff',
      border: '1px solid transparent',
      '--hover-bg': 'var(--color-success-dark)'
    },
    link: {
      background: 'transparent',
      color: 'var(--color-primary)',
      border: '1px solid transparent',
      textDecoration: 'underline',
      textUnderlineOffset: 4,
      padding: 0,
      height: 'auto'
    }
  };
  const v = variants[variant] || variants.primary;
  const isDisabled = disabled || loading;
  const [hover, setHover] = React.useState(false);
  const hoverBg = v['--hover-bg'];
  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s.gap,
    height: v.height ?? s.height,
    width: s.width,
    padding: v.padding ?? s.padding,
    fontSize: s.fontSize,
    fontFamily: 'var(--font-sans)',
    fontWeight: 'var(--font-weight-medium)',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    borderRadius: s.radius,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.5 : 1,
    transition: 'background var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)',
    outline: 'none',
    ...v,
    ...(hover && !isDisabled && hoverBg ? {
      background: hoverBg
    } : {}),
    ...style
  };
  delete baseStyle['--hover-bg'];
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: isDisabled,
    className: className,
    style: baseStyle,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false)
  }, props), loading ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 14,
      borderRadius: '50%',
      border: '2px solid currentColor',
      borderTopColor: 'transparent',
      display: 'inline-block',
      animation: 'hipertms-spin 0.6s linear infinite',
      opacity: 0.85
    },
    "aria-hidden": true
  }) : iconLeft, children, iconRight, /*#__PURE__*/React.createElement("style", null, '@keyframes hipertms-spin{to{transform:rotate(360deg)}}'));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — surface container. rounded-xl, soft shadow, 1px border.
 * Optional title / description / action header and footer; lifts on hover
 * when `interactive`.
 */
function Card({
  title,
  description,
  action,
  footer,
  interactive = false,
  padding = 24,
  className = '',
  style = {},
  children,
  ...props
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", _extends({
    className: className,
    onMouseEnter: () => interactive && setHover(true),
    onMouseLeave: () => interactive && setHover(false),
    style: {
      background: 'var(--color-surface-raised)',
      border: '1px solid var(--color-surface-border)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: hover ? 'var(--shadow-card-hover)' : 'var(--shadow-card)',
      color: 'var(--color-fg)',
      fontFamily: 'var(--font-sans)',
      transform: hover ? 'translateY(-2px)' : 'none',
      transition: 'box-shadow var(--duration-base) var(--ease-standard), transform var(--duration-base) var(--ease-standard)',
      cursor: interactive ? 'pointer' : 'default',
      overflow: 'hidden',
      ...style
    }
  }, props), (title || description || action) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      padding: `${padding}px ${padding}px 0`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 'var(--font-weight-semibold)',
      lineHeight: 1.3
    }
  }, title), description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--color-fg-muted)',
      marginTop: 4,
      lineHeight: 1.5
    }
  }, description)), action && /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0
    }
  }, action)), children != null && /*#__PURE__*/React.createElement("div", {
    style: {
      padding
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: `0 ${padding}px ${padding}px`,
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, footer));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Checkbox — square check with Ignition-Orange fill when checked. */
function Checkbox({
  checked,
  defaultChecked = false,
  onCheckedChange,
  disabled = false,
  label,
  style = {},
  ...props
}) {
  const isControlled = checked !== undefined;
  const [internal, setInternal] = React.useState(defaultChecked);
  const on = isControlled ? checked : internal;
  const toggle = () => {
    if (disabled) return;
    if (!isControlled) setInternal(!on);
    onCheckedChange?.(!on);
  };
  const box = /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    role: "checkbox",
    "aria-checked": on,
    disabled: disabled,
    onClick: toggle,
    style: {
      width: 18,
      height: 18,
      flexShrink: 0,
      padding: 0,
      borderRadius: 'var(--radius-sm)',
      border: on ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
      background: on ? 'var(--color-primary)' : 'var(--color-surface-raised)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'background var(--duration-fast), border-color var(--duration-fast)',
      ...style
    }
  }, props), on && /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 12 12",
    fill: "none",
    "aria-hidden": true
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2.5 6.2l2.2 2.3L9.5 3.5",
    stroke: "var(--color-primary-content)",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })));
  if (!label) return box;
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 9,
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      color: 'var(--color-fg)',
      cursor: disabled ? 'not-allowed' : 'pointer'
    }
  }, box, label);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Input — single-line text field. Optional label, prefix (e.g. "R$"),
 * helper / error text. 36px tall, md radius, soft ring on focus.
 */
function Input({
  label,
  prefix,
  suffix,
  helper,
  error,
  id,
  className = '',
  style = {},
  ...props
}) {
  const [focus, setFocus] = React.useState(false);
  const inputId = id || React.useId();
  const invalid = Boolean(error);
  const borderColor = invalid ? 'var(--color-danger)' : focus ? 'var(--color-primary)' : 'var(--color-surface-border)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontFamily: 'var(--font-sans)'
    },
    className: className
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontSize: 13,
      fontWeight: 'var(--font-weight-medium)',
      color: 'var(--color-fg)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      height: 36,
      background: 'var(--color-surface-raised)',
      border: `1px solid ${borderColor}`,
      borderRadius: 'var(--radius-md)',
      boxShadow: focus && !invalid ? '0 0 0 3px color-mix(in oklab, var(--color-primary) 22%, transparent)' : 'var(--shadow-inner-soft)',
      transition: 'border-color var(--duration-fast), box-shadow var(--duration-fast)',
      overflow: 'hidden',
      ...style
    }
  }, prefix != null && /*#__PURE__*/React.createElement("span", {
    style: {
      paddingLeft: 12,
      color: 'var(--color-fg-subtle)',
      fontSize: 14
    }
  }, prefix), /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    "aria-invalid": invalid || undefined,
    onFocus: e => {
      setFocus(true);
      props.onFocus?.(e);
    },
    onBlur: e => {
      setFocus(false);
      props.onBlur?.(e);
    },
    style: {
      flex: 1,
      minWidth: 0,
      height: '100%',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      padding: '0 12px',
      fontSize: 14,
      fontFamily: 'inherit',
      color: 'var(--color-fg)'
    }
  }, props)), suffix != null && /*#__PURE__*/React.createElement("span", {
    style: {
      paddingRight: 12,
      color: 'var(--color-fg-subtle)',
      fontSize: 14
    }
  }, suffix)), (error || helper) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: invalid ? 'var(--color-danger)' : 'var(--color-fg-muted)'
    }
  }, error || helper));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Select — styled native dropdown with optional label and chevron. */
function Select({
  label,
  helper,
  error,
  options = [],
  placeholder,
  id,
  className = '',
  style = {},
  ...props
}) {
  const selectId = id || React.useId();
  const invalid = Boolean(error);
  const [focus, setFocus] = React.useState(false);
  const borderColor = invalid ? 'var(--color-danger)' : focus ? 'var(--color-primary)' : 'var(--color-surface-border)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontFamily: 'var(--font-sans)'
    },
    className: className
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: selectId,
    style: {
      fontSize: 13,
      fontWeight: 'var(--font-weight-medium)',
      color: 'var(--color-fg)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    id: selectId,
    "aria-invalid": invalid || undefined,
    onFocus: e => {
      setFocus(true);
      props.onFocus?.(e);
    },
    onBlur: e => {
      setFocus(false);
      props.onBlur?.(e);
    },
    style: {
      appearance: 'none',
      WebkitAppearance: 'none',
      width: '100%',
      height: 36,
      padding: '0 34px 0 12px',
      fontSize: 14,
      fontFamily: 'inherit',
      color: 'var(--color-fg)',
      background: 'var(--color-surface-raised)',
      border: `1px solid ${borderColor}`,
      borderRadius: 'var(--radius-md)',
      boxShadow: focus && !invalid ? '0 0 0 3px color-mix(in oklab, var(--color-primary) 22%, transparent)' : 'var(--shadow-inner-soft)',
      outline: 'none',
      cursor: 'pointer',
      transition: 'border-color var(--duration-fast), box-shadow var(--duration-fast)',
      ...style
    }
  }, props), placeholder && /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true,
    hidden: true
  }, placeholder), options.map(o => {
    const value = typeof o === 'string' ? o : o.value;
    const labelText = typeof o === 'string' ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: value,
      value: value
    }, labelText);
  })), /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": true,
    style: {
      position: 'absolute',
      right: 11,
      pointerEvents: 'none',
      color: 'var(--color-fg-subtle)'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 6l4 4 4-4",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), (error || helper) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: invalid ? 'var(--color-danger)' : 'var(--color-fg-muted)'
    }
  }, error || helper));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Select.jsx", error: String((e && e.message) || e) }); }

// components/core/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Switch — on/off toggle. Primary (orange) when on. */
function Switch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  disabled = false,
  label,
  id,
  style = {},
  ...props
}) {
  const isControlled = checked !== undefined;
  const [internal, setInternal] = React.useState(defaultChecked);
  const on = isControlled ? checked : internal;
  const toggle = () => {
    if (disabled) return;
    if (!isControlled) setInternal(!on);
    onCheckedChange?.(!on);
  };
  const sw = /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    role: "switch",
    "aria-checked": on,
    disabled: disabled,
    onClick: toggle,
    style: {
      width: 38,
      height: 22,
      borderRadius: 'var(--radius-full)',
      border: 'none',
      background: on ? 'var(--color-primary)' : 'var(--color-base-300)',
      position: 'relative',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      padding: 0,
      flexShrink: 0,
      transition: 'background var(--duration-fast) var(--ease-standard)',
      ...style
    }
  }, props), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 2,
      left: on ? 18 : 2,
      width: 18,
      height: 18,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: 'var(--shadow-soft)',
      transition: 'left var(--duration-fast) var(--ease-standard)'
    }
  }));
  if (!label) return sw;
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      color: 'var(--color-fg)',
      cursor: disabled ? 'not-allowed' : 'pointer'
    }
  }, sw, label);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Switch.jsx", error: String((e && e.message) || e) }); }

// components/data/Avatar.jsx
try { (() => {
/**
 * Avatar — user/entity mark. Image or initials on a navy fill, sizes xs–lg,
 * optional status dot. Circle by default.
 */
function Avatar({
  name = '',
  src,
  size = 'md',
  status,
  square = false,
  style = {}
}) {
  const px = {
    xs: 24,
    sm: 30,
    md: 38,
    lg: 48
  }[size] || 38;
  const font = {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 18
  }[size] || 14;
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const statusColor = {
    online: 'var(--color-success)',
    busy: 'var(--color-danger)',
    away: 'var(--color-warning)',
    offline: 'var(--color-neutral-ink)'
  }[status];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      width: px,
      height: px,
      flexShrink: 0,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: px,
      height: px,
      borderRadius: square ? 'var(--radius-md)' : '50%',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-navy)',
      color: '#fff',
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      fontSize: font,
      letterSpacing: '.02em'
    }
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : initials), status && /*#__PURE__*/React.createElement("span", {
    title: status,
    style: {
      position: 'absolute',
      right: -1,
      bottom: -1,
      width: Math.max(8, px * 0.26),
      height: Math.max(8, px * 0.26),
      borderRadius: '50%',
      background: statusColor,
      border: '2px solid var(--color-surface-raised)'
    }
  }));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/data/DataTable.jsx
try { (() => {
/**
 * DataTable — list table with header, hover rows, alignment & custom cell
 * renderers. Header uses base-200; rows divide with hairlines and wash on hover.
 */
function DataTable({
  columns = [],
  data = [],
  getRowKey,
  onRowClick,
  dense = false,
  className = '',
  style = {}
}) {
  const pad = dense ? '8px 12px' : '12px 16px';
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      width: '100%',
      overflowX: 'auto',
      borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--color-surface-border)',
      background: 'var(--color-surface-raised)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: 'var(--color-base-200)'
    }
  }, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: {
      textAlign: c.align || 'left',
      padding: pad,
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '.05em',
      color: 'var(--color-fg-subtle)',
      whiteSpace: 'nowrap',
      width: c.width
    }
  }, c.header)))), /*#__PURE__*/React.createElement("tbody", null, data.map((row, i) => /*#__PURE__*/React.createElement(Row, {
    key: getRowKey ? getRowKey(row, i) : i,
    row: row,
    columns: columns,
    pad: pad,
    last: i === data.length - 1,
    onClick: onRowClick ? () => onRowClick(row, i) : undefined
  })))));
}
function Row({
  row,
  columns,
  pad,
  last,
  onClick
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("tr", {
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    onClick: onClick,
    style: {
      borderBottom: last ? 'none' : '1px solid var(--color-surface-border)',
      background: h && onClick ? 'var(--color-base-200)' : 'transparent',
      cursor: onClick ? 'pointer' : 'default'
    }
  }, columns.map(c => /*#__PURE__*/React.createElement("td", {
    key: c.key,
    style: {
      padding: pad,
      textAlign: c.align || 'left',
      fontSize: 13,
      color: 'var(--color-fg)',
      whiteSpace: c.wrap ? 'normal' : 'nowrap',
      fontVariantNumeric: c.numeric ? 'tabular-nums' : 'normal',
      fontFamily: c.numeric ? 'var(--font-mono)' : 'inherit'
    }
  }, c.render ? c.render(row[c.key], row) : row[c.key])));
}
Object.assign(__ds_scope, { DataTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/DataTable.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Pagination.jsx
try { (() => {
/**
 * Pagination — page navigation for lists/tables. `default` (bordered block
 * with "Por página" select + total) or `compact` (thin footer bar).
 */
function Pagination({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  itemsPerPage = 25,
  onPageChange,
  onItemsPerPageChange,
  itemsPerPageOptions = [25, 50, 100],
  variant = 'default',
  className = '',
  style = {}
}) {
  const compact = variant === 'compact';
  const tp = Math.max(1, totalPages);
  const start = totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const end = Math.min(currentPage * itemsPerPage, totalItems);
  const go = p => onPageChange?.(p);
  const navBtn = (dir, disabled, onClick) => /*#__PURE__*/React.createElement("button", {
    type: "button",
    disabled: disabled,
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      border: '1px solid var(--color-surface-border)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-surface-raised)',
      color: 'var(--color-fg)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      fontFamily: 'var(--font-sans)',
      fontSize: compact ? 12 : 13,
      padding: compact ? '3px 7px' : '6px 11px'
    }
  }, dir === 'prev' && /*#__PURE__*/React.createElement(Chevron, {
    dir: "left"
  }), !compact && /*#__PURE__*/React.createElement("span", null, dir === 'prev' ? 'Anterior' : 'Próxima'), dir === 'next' && /*#__PURE__*/React.createElement(Chevron, {
    dir: "right"
  }));
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-fg-muted)',
      ...(compact ? {
        borderTop: '1px solid var(--color-surface-border)',
        padding: '8px 10px'
      } : {
        border: '1px solid var(--color-surface-border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--color-surface-raised)',
        padding: '10px 16px'
      }),
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, onItemsPerPageChange && /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: compact ? 12 : 13
    }
  }, /*#__PURE__*/React.createElement("span", null, "Por p\xE1gina"), /*#__PURE__*/React.createElement("select", {
    value: itemsPerPage,
    onChange: e => onItemsPerPageChange(Number(e.target.value)),
    style: {
      border: '1px solid var(--color-surface-border)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-surface-raised)',
      color: 'var(--color-fg)',
      fontSize: compact ? 12 : 13,
      padding: compact ? '2px 6px' : '4px 8px'
    }
  }, itemsPerPageOptions.map(o => /*#__PURE__*/React.createElement("option", {
    key: o,
    value: o
  }, o)))), !onItemsPerPageChange && totalItems > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: compact ? 12 : 13
    }
  }, start, "\u2013", end, " de ", totalItems)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, navBtn('prev', currentPage <= 1, () => go(currentPage - 1)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontVariantNumeric: 'tabular-nums',
      fontSize: compact ? 12 : 13,
      padding: '0 4px'
    }
  }, compact ? `${currentPage} / ${tp}` : `Página ${currentPage} de ${tp}`), navBtn('next', currentPage >= tp, () => go(currentPage + 1))));
}
function Chevron({
  dir
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": true,
    style: {
      transform: dir === 'right' ? 'rotate(180deg)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 4l-4 4 4 4",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}
Object.assign(__ds_scope, { Pagination });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Pagination.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Sidebar.jsx
try { (() => {
/**
 * Sidebar — the HiperTMS dark navigation rail ("midnight enterprise").
 * Renders a logo header, grouped nav rows (with icon + optional badge), an
 * active item (Ignition-Orange dot + icon), and an optional footer.
 */
function Sidebar({
  sections = [],
  activeId,
  onNavigate,
  logo,
  footer,
  width = 224,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-sidebar-bg)',
      borderRight: '1px solid var(--color-sidebar-border)',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, logo && /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      borderBottom: '1px solid var(--color-sidebar-border)'
    }
  }, typeof logo === 'string' ? /*#__PURE__*/React.createElement("img", {
    src: logo,
    alt: "",
    style: {
      height: 26
    }
  }) : logo), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '14px 10px'
    }
  }, sections.map((sec, si) => /*#__PURE__*/React.createElement("div", {
    key: si,
    style: {
      marginBottom: 6
    }
  }, sec.label && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '.1em',
      textTransform: 'uppercase',
      color: 'var(--color-sidebar-section)',
      padding: '8px 8px 6px'
    }
  }, sec.label), si > 0 && !sec.label && /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--color-sidebar-border)',
      margin: '8px'
    }
  }), sec.items.map(it => /*#__PURE__*/React.createElement(Row, {
    key: it.id,
    item: it,
    active: activeId === it.id,
    onClick: () => onNavigate?.(it.id)
  }))))), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 18px',
      borderTop: '1px solid var(--color-sidebar-border)',
      fontSize: 11,
      color: 'var(--color-sidebar-section)'
    }
  }, footer));
}
function Row({
  item,
  active,
  onClick
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    title: item.label,
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      padding: '8px 10px',
      marginBottom: 1,
      border: 'none',
      borderRadius: 'var(--radius-lg)',
      cursor: 'pointer',
      textAlign: 'left',
      fontFamily: 'inherit',
      fontSize: 13,
      background: active ? 'var(--color-sidebar-active)' : h ? 'var(--color-sidebar-hover)' : 'transparent',
      color: active ? 'var(--color-sidebar-text-active)' : h ? 'var(--color-sidebar-text-hover)' : 'var(--color-sidebar-text)',
      fontWeight: active ? 600 : 500
    }
  }, active && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 0,
      width: 6,
      display: 'flex',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--color-sidebar-icon-accent)'
    }
  })), item.icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      color: active ? 'var(--color-sidebar-icon-accent)' : 'inherit',
      lineHeight: 0
    }
  }, item.icon), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, item.label), item.badge != null && /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 18,
      height: 18,
      padding: '0 5px',
      borderRadius: 'var(--radius-full)',
      background: 'var(--color-danger)',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, item.badge));
}
Object.assign(__ds_scope, { Sidebar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Sidebar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
/**
 * Tabs — segmented control. `pill` (default; track + raised active chip) or
 * `line` (underline, Ignition-Orange active). Controlled or uncontrolled.
 */
function Tabs({
  items = [],
  value,
  defaultValue,
  onValueChange,
  variant = 'pill',
  className = '',
  style = {}
}) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState(defaultValue ?? items[0]?.value);
  const active = isControlled ? value : internal;
  const select = v => {
    if (!isControlled) setInternal(v);
    onValueChange?.(v);
  };
  if (variant === 'line') {
    return /*#__PURE__*/React.createElement("div", {
      role: "tablist",
      className: className,
      style: {
        display: 'flex',
        gap: 4,
        borderBottom: '1px solid var(--color-surface-border)',
        fontFamily: 'var(--font-sans)',
        ...style
      }
    }, items.map(it => {
      const on = active === it.value;
      return /*#__PURE__*/React.createElement("button", {
        key: it.value,
        role: "tab",
        "aria-selected": on,
        onClick: () => select(it.value),
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          marginBottom: -1,
          border: 'none',
          borderBottom: `2px solid ${on ? 'var(--color-primary)' : 'transparent'}`,
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 500,
          fontFamily: 'inherit',
          color: on ? 'var(--color-primary)' : 'var(--color-fg-muted)'
        }
      }, it.icon, it.label, it.badge != null && /*#__PURE__*/React.createElement(Pill, null, it.badge));
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    className: className,
    style: {
      display: 'inline-flex',
      gap: 3,
      padding: 3,
      borderRadius: 'var(--radius-lg)',
      background: 'var(--color-base-200)',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, items.map(it => {
    const on = active === it.value;
    return /*#__PURE__*/React.createElement("button", {
      key: it.value,
      role: "tab",
      "aria-selected": on,
      onClick: () => select(it.value),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '6px 14px',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: on ? 600 : 500,
        fontFamily: 'inherit',
        background: on ? 'var(--color-surface-raised)' : 'transparent',
        color: on ? 'var(--color-fg)' : 'var(--color-fg-muted)',
        boxShadow: on ? 'var(--shadow-soft)' : 'none',
        transition: 'background .15s'
      }
    }, it.icon, it.label, it.badge != null && /*#__PURE__*/React.createElement(Pill, null, it.badge));
  }));
}
function Pill({
  children
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      borderRadius: 'var(--radius-full)',
      background: 'var(--color-base-300)',
      padding: '0 6px',
      fontSize: 11,
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      color: 'var(--color-fg-muted)'
    }
  }, children);
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/overlay/Dialog.jsx
try { (() => {
/**
 * Dialog — centered modal over a dim backdrop. Optional status icon, title,
 * description, body and a footer actions row. Controlled via `open`.
 */
function Dialog({
  open,
  onClose,
  title,
  description,
  variant,
  icon,
  footer,
  width = 440,
  children
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const variantIcon = {
    danger: {
      glyph: 'M3 6h18M8 6V4h8v2m-9 0v14h10V6',
      color: 'var(--color-danger)'
    },
    warning: {
      glyph: 'M12 3l9 16H3z M12 10v4 M12 17h.01',
      color: 'var(--color-warning)'
    },
    success: {
      glyph: 'M20 6L9 17l-5-5',
      color: 'var(--color-success)'
    },
    info: {
      glyph: 'M12 8h.01M11 12h1v4h1',
      color: 'var(--color-primary)'
    }
  }[variant];
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 300,
      background: 'rgba(14,15,19,.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    role: "dialog",
    "aria-modal": "true",
    style: {
      width: '100%',
      maxWidth: width,
      background: 'var(--color-surface-raised)',
      borderRadius: 'var(--radius-2xl)',
      boxShadow: 'var(--shadow-elevated)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      padding: '28px 24px 22px'
    }
  }, (icon || variantIcon) && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 44,
      height: 44,
      flexShrink: 0,
      borderRadius: '50%',
      background: 'var(--color-base-200)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, icon || /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: variantIcon.glyph,
    stroke: variantIcon.color,
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--color-fg)',
      margin: 0
    }
  }, title), description && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      lineHeight: 1.55,
      color: 'var(--color-fg-muted)',
      margin: '8px 0 0'
    }
  }, description), children && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, children))), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 8,
      padding: '14px 20px',
      borderTop: '1px solid var(--color-surface-border)',
      background: 'var(--color-base-100)'
    }
  }, footer)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/overlay/Toast.jsx
try { (() => {
/**
 * Toast — transient notification card. Status accent stripe + icon, title,
 * optional message, optional close. Presentational (you manage the stack).
 */
function Toast({
  variant = 'info',
  title,
  message,
  onClose,
  style = {}
}) {
  const map = {
    success: {
      color: 'var(--color-success)',
      glyph: 'M20 6L9 17l-5-5'
    },
    warning: {
      color: 'var(--color-warning)',
      glyph: 'M12 3l9 16H3z M12 10v4 M12 17h.01'
    },
    danger: {
      color: 'var(--color-danger)',
      glyph: 'M18 6L6 18M6 6l12 12'
    },
    info: {
      color: 'var(--color-primary)',
      glyph: 'M12 8h.01M11 12h1v4h1'
    }
  }[variant];
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      minWidth: 280,
      maxWidth: 400,
      padding: '13px 14px 13px 16px',
      background: 'var(--color-surface-raised)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-elevated)',
      borderLeft: `3px solid ${map.color}`,
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flexShrink: 0,
      marginTop: 1,
      color: map.color,
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: map.glyph,
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, title), message && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      lineHeight: 1.5,
      color: 'var(--color-fg-muted)',
      marginTop: title ? 2 : 0
    }
  }, message)), onClose && /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Fechar",
    style: {
      flexShrink: 0,
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--color-fg-subtle)',
      padding: 2,
      lineHeight: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6L6 18M6 6l12 12",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round"
  }))));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/Toast.jsx", error: String((e && e.message) || e) }); }

// components/overlay/Tooltip.jsx
try { (() => {
/**
 * Tooltip — dark hover/focus label anchored to a trigger. Wrap any element.
 */
function Tooltip({
  label,
  side = 'top',
  children,
  style = {}
}) {
  const [open, setOpen] = React.useState(false);
  const pos = {
    top: {
      bottom: '100%',
      left: '50%',
      transform: 'translate(-50%, -6px)'
    },
    bottom: {
      top: '100%',
      left: '50%',
      transform: 'translate(-50%, 6px)'
    },
    left: {
      right: '100%',
      top: '50%',
      transform: 'translate(-6px, -50%)'
    },
    right: {
      left: '100%',
      top: '50%',
      transform: 'translate(6px, -50%)'
    }
  }[side];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      ...style
    },
    onPointerEnter: () => setOpen(true),
    onPointerLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
    tabIndex: 0
  }, children, open && /*#__PURE__*/React.createElement("span", {
    role: "tooltip",
    style: {
      position: 'absolute',
      zIndex: 300,
      ...pos,
      whiteSpace: 'nowrap',
      background: 'var(--color-ink-800)',
      color: '#fff',
      fontFamily: 'var(--font-sans)',
      fontSize: 12,
      fontWeight: 500,
      padding: '5px 9px',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-elevated)',
      pointerEvents: 'none'
    }
  }, label));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/Tooltip.jsx", error: String((e && e.message) || e) }); }

// dashboard-app.js
try { (() => {
/* global document */
// HiperTMS — App Shell + Dashboard (hi-fi). Data-driven sidebar/topbar/dashboard.

const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  docDup: '<rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h6"/>',
  map: '<path d="m9 5-6 2.4V20l6-2.4 6 2.4 6-2.4V5l-6 2.4z"/><path d="M9 5v12.6M15 7.4V20"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6 6 0 0 1 11.6 0"/>',
  store: '<path d="M2 7l1.5-3h17L22 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M16 6l2 2M19 3l2 2"/>',
  bolt: '<path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>'
};
function ico(name, cls) {
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const QUICK = [['doc', 'Cotações'], ['truck', 'Embarques'], ['clipboard', 'Cargas'], ['map', 'Viagens'], ['doc', 'CT-e'], ['docDup', 'MDF-e']];
const HUBS = [['trending', 'Vendas'], ['truck', 'Operação'], ['building', 'Cadastros'], ['wrench', 'Frota'], ['cart', 'Compras'], ['wallet', 'Financeiro'], ['users', 'Equipes'], ['layers', 'Precificação']];
const SYSTEM = [['chart', 'Administração'], ['userCircle', 'Minha Conta'], ['store', 'Dados da Empresa'], ['users', 'Usuários'], ['card', 'Assinatura e Cobrança'], ['wrench', 'Configuração da operação'], ['key', 'Sequenciadores'], ['bolt', 'Automação']];
function navRow(icon, label, active) {
  return `<button class="navrow${active ? ' active' : ''}" type="button">
    <span class="navicon">${active ? '<span class="dot"></span>' : ''}${ico(icon, 'ic5')}</span>
    <span class="navlabel">${label}</span>
  </button>`;
}
const SYS_ITEMS = `<div class="sys-items" id="sys-items">${SYSTEM.map(([i, l]) => navRow(i, l, false)).join('')}</div>`;
const sidebar = `
  <aside class="sidebar">
    <div class="sb-head"><span class="wm"><span class="h">Hiper</span><span class="t">TMS</span></span></div>
    <div class="sb-scroll">
      <p class="sb-grouplabel">Acesso rápido</p>
      ${QUICK.map(([i, l]) => navRow(i, l, false)).join('')}
      <div class="sb-divider"></div>
      ${HUBS.map(([i, l]) => navRow(i, l, false)).join('')}
    </div>
    <div class="sb-foot">
      <button class="navrow sys-toggle" type="button" id="sys-toggle">
        <span class="navicon">${ico('chart', 'ic5')}</span>
        <span class="navlabel">Sistema</span>
        <span class="navchev">${ico('chevD', 'ic4')}</span>
      </button>
      ${SYS_ITEMS}
      <div class="sb-version">HiperTMS v12</div>
    </div>
  </aside>`;
const topbar = `
  <header class="topbar">
    <div class="tb-left">
      <button class="tenant"><span class="tenant-logo">TM</span><span class="tenant-name">Transportadora Modelo LTDA</span>${ico('chevR', 'ic4 muted')}</button>
    </div>
    <div class="tb-center">
      ${ico('calendar', 'ic4 muted')}
      <span class="dt"><span>Segunda-feira</span><span class="sep">|</span><span class="nums">09/06/2026</span><span class="sep">·</span><span class="nums">14:30</span></span>
    </div>
    <div class="tb-right">
      <button class="iconbtn">${ico('chat', 'ic5')}</button>
      <button class="iconbtn">${ico('bell', 'ic5')}<span class="reddot"></span></button>
      <button class="iconbtn">${ico('moon', 'ic5')}</button>
      <button class="avatar">FO</button>
    </div>
  </header>`;

// ---- Dashboard content ----
function statusColor(key) {
  if (/CANCEL|REJECT|EXPIR/.test(key)) return 'hsl(350 70% 52%)';
  if (/PENDING|DRAFT|OPEN|PLANNED/.test(key)) return 'hsl(262 65% 52%)';
  if (/PROGRESS|TRANSIT|SCHEDULED/.test(key)) return 'hsl(38 92% 48%)';
  if (/APPROVED|DELIVERED|COMPLETED|DISPATCHED/.test(key)) return 'hsl(152 55% 38%)';
  if (/CONVERTED|CLOSED/.test(key)) return 'hsl(200 75% 42%)';
  return 'hsl(220 14% 46%)';
}
const PANELS = [{
  title: 'Cotações',
  foot: 'Ver cotações',
  data: [['DRAFT', 'Rascunho', 8], ['OPEN', 'Aberta', 14], ['APPROVED', 'Aprovada', 6], ['CONVERTED', 'Convertida', 11], ['REJECTED', 'Rejeitada', 3], ['EXPIRED', 'Expirada', 2]]
}, {
  title: 'Embarques',
  foot: 'Ver Embarques',
  data: [['PICKUP_PENDING', 'Coleta pend.', 5], ['PICKUP_SCHEDULED', 'Coleta agend.', 7], ['IN_TRANSIT', 'Em trânsito', 9], ['IN_STORAGE', 'Em armazém', 4], ['DELIVERED', 'Entregue', 22], ['CANCELLED', 'Cancelado', 2]]
}, {
  title: 'Cargas',
  foot: 'Ver Cargas',
  data: [['OPEN', 'Aberta', 6], ['CLOSED', 'Fechada', 4], ['DISPATCHED', 'Expedida', 10], ['CANCELLED', 'Cancelada', 1]]
}, {
  title: 'Viagens',
  foot: 'Ver Viagens',
  data: [['PLANNED', 'Planejada', 4], ['IN_PROGRESS', 'Em and.', 6], ['COMPLETED', 'Concluída', 18], ['CLOSED', 'Fechada', 9], ['CANCELLED', 'Cancelada', 2]]
}];
function barChart(data) {
  const max = Math.max(...data.map(d => d[2]), 1);
  return `<div class="barchart">${data.map(([k, lab, v]) => `
    <div class="barcol">
      <span class="barval">${v}</span>
      <div class="bartrack"><div class="bar" style="height:${Math.round(v / max * 100)}%;background:${statusColor(k)};"></div></div>
      <span class="barlabel">${lab}</span>
    </div>`).join('')}</div>`;
}
const panelsHtml = `<div class="panels">${PANELS.map(p => `
  <div class="panel">
    <div class="panel-head"><h3>${p.title}</h3></div>
    <div class="panel-body">${barChart(p.data)}</div>
    <button class="panel-foot">${p.foot} ${ico('arrowR', 'ic4')}</button>
  </div>`).join('')}</div>`;

// Time series area chart (SVG)
const series = [12, 18, 15, 24, 21, 28, 26, 34, 30, 38, 35, 42];
function areaChart() {
  const w = 520,
    h = 200,
    pad = 8;
  const max = Math.max(...series),
    min = 0;
  const stepX = (w - pad * 2) / (series.length - 1);
  const pts = series.map((v, i) => [pad + i * stepX, h - pad - (v - min) / (max - min) * (h - pad * 2)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ` L${(w - pad).toFixed(1)} ${h - pad} L${pad} ${h - pad} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="area">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a1f" stop-opacity="0.22"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#ag)"/><path d="${line}" fill="none" stroke="#ff5a1f" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="#ff5a1f"/>`).join('')}
  </svg>`;
}
function donut(segments, centerLabel) {
  let acc = 0;
  const stops = [];
  const total = segments.reduce((s, x) => s + x[2], 0);
  segments.forEach(([,, v, c]) => {
    const a = v / total * 360;
    stops.push(`${c} ${acc}deg ${acc + a}deg`);
    acc += a;
  });
  return `<div class="donut-wrap">
    <div class="donut" style="background:conic-gradient(${stops.join(',')});"><div class="donut-hole"><span class="donut-total">${total}</span><span class="donut-cap">${centerLabel}</span></div></div>
    <ul class="legend">${segments.map(([, lab, v, c]) => `<li><span class="lg-dot" style="background:${c};"></span>${lab}<span class="lg-v">${v}</span></li>`).join('')}</ul>
  </div>`;
}
const fleetHtml = `
  <div class="fleet">
    <div class="fcard"><div class="panel-head"><h3>Veículos por status</h3></div>${donut([['ok', 'Disponível', 12, 'hsl(152 55% 38%)'], ['trip', 'Em viagem', 8, 'hsl(38 92% 48%)'], ['maint', 'Manutenção', 3, 'hsl(350 70% 52%)'], ['off', 'Inativo', 2, 'hsl(220 14% 46%)']], 'veículos')}</div>
    <div class="fcard"><div class="panel-head"><h3>Motoristas por status</h3></div>${donut([['ok', 'Disponível', 10, 'hsl(152 55% 38%)'], ['trip', 'Em viagem', 8, 'hsl(38 92% 48%)'], ['rest', 'Folga', 4, 'hsl(200 75% 42%)'], ['off', 'Inativo', 1, 'hsl(220 14% 46%)']], 'motoristas')}</div>
  </div>`;
const content = `
  <div class="page">
    <div class="page-head">
      <div class="ph-icon">${ico('chart', 'ic6')}</div>
      <div>
        <p class="breadcrumb">Painel <span>›</span> Operacional</p>
        <h1 class="ph-title">Bom dia, Fábio!</h1>
        <p class="ph-desc">Resumo operacional: cotações, embarques, programação de cargas e viagens por estado.</p>
      </div>
    </div>
    <div class="dash-card">
      ${panelsHtml}
      <div class="dash-2col">
        <div class="ts-card">
          <div class="panel-head"><h3>Volume logístico (12 semanas)</h3></div>
          <div class="ts-body">${areaChart()}</div>
        </div>
        ${fleetHtml}
      </div>
    </div>
  </div>`;
document.getElementById('app').innerHTML = `<div class="shell">${sidebar}<div class="main">${topbar}<div class="scrollarea">${content}</div></div></div>`;

// Sistema footer: collapsible (collapsed by default)
const sysToggle = document.getElementById('sys-toggle');
if (sysToggle) sysToggle.addEventListener('click', () => {
  document.getElementById('sys-items').classList.toggle('open');
  sysToggle.classList.toggle('expanded');
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "dashboard-app.js", error: String((e && e.message) || e) }); }

// design-canvas.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// DesignCanvas.jsx — Figma-ish design canvas wrapper
// Warm gray grid bg + Sections + Artboards + PostIt notes.
// Exports (to window): DesignCanvas, DCSection, DCArtboard, DCPostIt.
// Artboards are reorderable (grip-drag), deletable, labels/titles are
// inline-editable, and any artboard can be opened in a fullscreen focus
// overlay (←/→/Esc). State persists to a .design-canvas.state.json sidecar
// via the host bridge. No assets, no deps.
//
// Usage:
//   <DesignCanvas>
//     <DCSection id="onboarding" title="Onboarding" subtitle="First-run variants">
//       <DCArtboard id="a" label="A · Dusk" width={260} height={480}>…</DCArtboard>
//       <DCArtboard id="b" label="B · Minimal" width={260} height={480}>…</DCArtboard>
//     </DCSection>
//   </DesignCanvas>
//
// Artboards are static design frames, not scroll regions — never use
// height: 100% + overflow: auto/scroll on inner elements; size each artboard
// to fit its content (explicit pixel height, or let it grow).
/* END USAGE */

const DC = {
  bg: '#f0eee9',
  grid: 'rgba(0,0,0,0.06)',
  label: 'rgba(60,50,40,0.7)',
  title: 'rgba(40,30,20,0.85)',
  subtitle: 'rgba(60,50,40,0.6)',
  postitBg: '#fef4a8',
  postitText: '#5a4a2a',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
};

// One-time CSS injection (classes are dc-prefixed so they don't collide with
// the hosted design's own styles).
if (typeof document !== 'undefined' && !document.getElementById('dc-styles')) {
  const s = document.createElement('style');
  s.id = 'dc-styles';
  s.textContent = ['.dc-editable{cursor:text;outline:none;white-space:nowrap;border-radius:3px;padding:0 2px;margin:0 -2px}', '.dc-editable:focus{background:#fff;box-shadow:0 0 0 1.5px #c96442}', '[data-dc-slot]{transition:transform .18s cubic-bezier(.2,.7,.3,1)}', '[data-dc-slot].dc-dragging{transition:none;z-index:10;pointer-events:none}', '[data-dc-slot].dc-dragging .dc-card{box-shadow:0 12px 40px rgba(0,0,0,.25),0 0 0 2px #c96442;transform:scale(1.02)}',
  // isolation:isolate contains artboard content's z-indexes so a
  // z-indexed child (sticky navbar etc.) can't paint over .dc-header or
  // the .dc-menu popover that drops into the top of the card.
  '.dc-card{isolation:isolate;transition:box-shadow .15s,transform .15s}', '.dc-card *{scrollbar-width:none}', '.dc-card *::-webkit-scrollbar{display:none}',
  // Per-artboard header: grip + label on the left, delete/expand on the
  // right. Single flex row; when the artboard's on-screen width is too
  // narrow for both the label yields (ellipsis, then hidden entirely below
  // ~4ch via the container query) and the buttons stay on the row.
  '.dc-header{position:absolute;bottom:100%;left:-4px;margin-bottom:calc(4px * var(--dc-inv-zoom,1));z-index:2;', '  display:flex;align-items:center;container-type:inline-size}', '.dc-labelrow{display:flex;align-items:center;gap:4px;height:24px;flex:1 1 auto;min-width:0}', '.dc-grip{flex:0 0 auto;cursor:grab;display:flex;align-items:center;padding:5px 4px;border-radius:4px;transition:background .12s,opacity .12s}', '.dc-grip:hover{background:rgba(0,0,0,.08)}', '.dc-grip:active{cursor:grabbing}', '.dc-labeltext{flex:1 1 auto;min-width:0;cursor:pointer;border-radius:4px;padding:3px 6px;', '  display:flex;align-items:center;transition:background .12s;overflow:hidden}',
  // Below ~4ch of label room: hide the label entirely, and drop the grip to
  // hover-only (same reveal rule as .dc-btns) so a narrow header is clean
  // until the card is moused.
  '@container (max-width: 110px){', '  .dc-labeltext{display:none}', '  .dc-grip{opacity:0}', '  [data-dc-slot]:hover .dc-grip{opacity:1}', '}', '.dc-labeltext:hover{background:rgba(0,0,0,.05)}', '.dc-labeltext .dc-editable{overflow:hidden;text-overflow:ellipsis;max-width:100%}', '.dc-labeltext .dc-editable:focus{overflow:visible;text-overflow:clip}', '.dc-btns{flex:0 0 auto;margin-left:auto;display:flex;gap:2px;opacity:0;transition:opacity .12s}', '[data-dc-slot]:hover .dc-btns,.dc-btns:has(.dc-menu){opacity:1}', '.dc-expand,.dc-kebab{width:22px;height:22px;border-radius:5px;border:none;cursor:pointer;padding:0;', '  background:transparent;color:rgba(60,50,40,.7);display:flex;align-items:center;justify-content:center;', '  font:inherit;transition:background .12s,color .12s}', '.dc-expand:hover,.dc-kebab:hover{background:rgba(0,0,0,.06);color:#2a251f}',
  // Slot hosting an open menu floats above later siblings (which otherwise
  // paint on top — same z-index:auto, later DOM order) so the popup isn't
  // clipped by the next card.
  '[data-dc-slot]:has(.dc-menu){z-index:10}', '.dc-menu{position:absolute;top:100%;right:0;margin-top:4px;background:#fff;border-radius:8px;', '  box-shadow:0 8px 28px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.05);padding:4px;min-width:160px;z-index:10}', '.dc-menu button{display:block;width:100%;padding:7px 10px;border:0;background:transparent;', '  border-radius:5px;font-family:inherit;font-size:13px;font-weight:500;line-height:1.2;', '  color:#29261b;cursor:pointer;text-align:left;transition:background .12s;white-space:nowrap}', '.dc-menu button:hover{background:rgba(0,0,0,.05)}', '.dc-menu hr{border:0;border-top:1px solid rgba(0,0,0,.08);margin:4px 2px}', '.dc-menu .dc-danger{color:#c96442}', '.dc-menu .dc-danger:hover{background:rgba(201,100,66,.1)}',
  // Chrome (titles / labels / buttons) counter-scales against the viewport
  // zoom so it stays a constant on-screen size. --dc-inv-zoom is set by
  // DCViewport on every transform update and inherits to all descendants —
  // any overlay inside the world (e.g. a TweaksPanel on an artboard) can use
  // it the same way.
  //
  // The header uses transform:scale (out-of-flow, so layout impact doesn't
  // matter) with its world-space width set to card-width / inv-zoom so that
  // after counter-scaling its on-screen width exactly matches the card's —
  // that's what lets the container query + text-overflow behave against the
  // card's visible edge at every zoom level.
  //
  // The section head uses CSS zoom instead of transform so its layout box
  // grows with the counter-scale, pushing the card row down — otherwise the
  // constant-screen-size title would overflow into the (shrinking) world-
  // space gap and overlap the artboard headers at low zoom.
  '.dc-header{width:calc((100% + 4px) / var(--dc-inv-zoom,1));', '  transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom left}', '.dc-sectionhead{zoom:var(--dc-inv-zoom,1)}'].join('\n');
  document.head.appendChild(s);
}
const DCCtx = React.createContext(null);

// Recursively unwrap React.Fragment so <>…</> grouping doesn't hide
// DCSection/DCArtboard children from the type-based walks below.
function dcFlatten(children) {
  const out = [];
  React.Children.forEach(children, c => {
    if (c && c.type === React.Fragment) out.push(...dcFlatten(c.props.children));else out.push(c);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────
// DesignCanvas — stateful wrapper around the pan/zoom viewport.
// Owns runtime state (per-section order, renamed titles/labels, hidden
// artboards, focused artboard). Order/titles/labels/hidden persist to a
// .design-canvas.state.json
// sidecar next to the HTML. Reads go via plain fetch() so the saved
// arrangement is visible anywhere the HTML + sidecar are served together
// (omelette preview, direct link, downloaded zip). Writes go through the
// host's window.omelette bridge — editing requires the omelette runtime.
// Focus is ephemeral.
// ─────────────────────────────────────────────────────────────
const DC_STATE_FILE = '.design-canvas.state.json';
function DesignCanvas({
  children,
  minScale,
  maxScale,
  style
}) {
  const [state, setState] = React.useState({
    sections: {},
    focus: null
  });
  // Hold rendering until the sidecar read settles so the saved order/titles
  // appear on first paint (no source-order flash). didRead gates writes until
  // the read settles so the empty initial state can't clobber a slow read;
  // skipNextWrite suppresses the one echo-write that would otherwise follow
  // hydration.
  const [ready, setReady] = React.useState(false);
  const didRead = React.useRef(false);
  const skipNextWrite = React.useRef(false);
  React.useEffect(() => {
    let off = false;
    fetch('./' + DC_STATE_FILE).then(r => r.ok ? r.json() : null).then(saved => {
      if (off || !saved || !saved.sections) return;
      skipNextWrite.current = true;
      setState(s => ({
        ...s,
        sections: saved.sections
      }));
    }).catch(() => {}).finally(() => {
      didRead.current = true;
      if (!off) setReady(true);
    });
    const t = setTimeout(() => {
      if (!off) setReady(true);
    }, 150);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, []);
  React.useEffect(() => {
    if (!didRead.current) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    const t = setTimeout(() => {
      window.omelette?.writeFile(DC_STATE_FILE, JSON.stringify({
        sections: state.sections
      })).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [state.sections]);

  // Build registries synchronously from children so FocusOverlay can read
  // them in the same render. Fragments are flattened; wrapping in other
  // elements still opts out of focus/reorder.
  const registry = {}; // slotId -> { sectionId, artboard }
  const sectionMeta = {}; // sectionId -> { title, subtitle, slotIds[] }
  const sectionOrder = [];
  dcFlatten(children).forEach(sec => {
    if (!sec || sec.type !== DCSection) return;
    const sid = sec.props.id ?? sec.props.title;
    if (!sid) return;
    sectionOrder.push(sid);
    const persisted = state.sections[sid] || {};
    const abs = [];
    dcFlatten(sec.props.children).forEach(ab => {
      if (!ab || ab.type !== DCArtboard) return;
      const aid = ab.props.id ?? ab.props.label;
      if (aid) abs.push([aid, ab]);
    });
    // hidden is scoped to one source revision — when the agent regenerates
    // (artboard-ID set changes), prior deletes don't apply to new content.
    const srcKey = abs.map(([k]) => k).join('\x1f');
    const hidden = persisted.srcKey === srcKey ? persisted.hidden || [] : [];
    const srcIds = [];
    abs.forEach(([aid, ab]) => {
      if (hidden.includes(aid)) return;
      registry[`${sid}/${aid}`] = {
        sectionId: sid,
        artboard: ab
      };
      srcIds.push(aid);
    });
    const kept = (persisted.order || []).filter(k => srcIds.includes(k));
    sectionMeta[sid] = {
      title: persisted.title ?? sec.props.title,
      subtitle: sec.props.subtitle,
      slotIds: [...kept, ...srcIds.filter(k => !kept.includes(k))]
    };
  });
  const api = React.useMemo(() => ({
    state,
    section: id => state.sections[id] || {},
    patchSection: (id, p) => setState(s => ({
      ...s,
      sections: {
        ...s.sections,
        [id]: {
          ...s.sections[id],
          ...(typeof p === 'function' ? p(s.sections[id] || {}) : p)
        }
      }
    })),
    setFocus: slotId => setState(s => ({
      ...s,
      focus: slotId
    }))
  }), [state]);

  // Esc exits focus; any outside pointerdown commits an in-progress rename.
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') api.setFocus(null);
    };
    const onPd = e => {
      const ae = document.activeElement;
      if (ae && ae.isContentEditable && !ae.contains(e.target)) ae.blur();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPd, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPd, true);
    };
  }, [api]);
  return /*#__PURE__*/React.createElement(DCCtx.Provider, {
    value: api
  }, /*#__PURE__*/React.createElement(DCViewport, {
    minScale: minScale,
    maxScale: maxScale,
    style: style
  }, ready && children), state.focus && registry[state.focus] && /*#__PURE__*/React.createElement(DCFocusOverlay, {
    entry: registry[state.focus],
    sectionMeta: sectionMeta,
    sectionOrder: sectionOrder
  }));
}

// ─────────────────────────────────────────────────────────────
// DCViewport — transform-based pan/zoom (internal)
//
// Input mapping (Figma-style):
//   • trackpad pinch  → zoom   (ctrlKey wheel; Safari gesture* events)
//   • trackpad scroll → pan    (two-finger)
//   • mouse wheel     → zoom   (notched; distinguished from trackpad scroll)
//   • middle-drag / primary-drag-on-bg → pan
//
// Transform state lives in a ref and is written straight to the DOM
// (translate3d + will-change) so wheel ticks don't go through React —
// keeps pans at 60fps on dense canvases.
// ─────────────────────────────────────────────────────────────
function DCViewport({
  children,
  minScale = 0.1,
  maxScale = 8,
  style = {}
}) {
  const vpRef = React.useRef(null);
  const worldRef = React.useRef(null);
  const tf = React.useRef({
    x: 0,
    y: 0,
    scale: 1
  });
  // Persist viewport across reloads so the user lands back where they were
  // after an agent edit or browser refresh. The sandbox origin is already
  // per-project; pathname keeps multiple canvas files in one project apart.
  const tfKey = 'dc-viewport:' + location.pathname;
  const saveT = React.useRef(0);
  const lastPostedScale = React.useRef();
  const apply = React.useCallback(() => {
    const {
      x,
      y,
      scale
    } = tf.current;
    const el = worldRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    // Exposed for zoom-invariant chrome (labels, buttons, TweaksPanel).
    el.style.setProperty('--dc-inv-zoom', String(1 / scale));
    // Keep the host toolbar's % readout in sync with the canvas scale. Pan
    // ticks leave scale unchanged — skip the cross-frame post for those.
    if (lastPostedScale.current !== scale) {
      lastPostedScale.current = scale;
      window.parent.postMessage({
        type: '__dc_zoom',
        scale
      }, '*');
    }
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    }, 200);
  }, [tfKey]);
  React.useLayoutEffect(() => {
    const flush = () => {
      clearTimeout(saveT.current);
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    };
    try {
      const s = JSON.parse(localStorage.getItem(tfKey) || 'null');
      if (s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.scale)) {
        tf.current = {
          x: s.x,
          y: s.y,
          scale: Math.min(maxScale, Math.max(minScale, s.scale))
        };
        apply();
      }
    } catch {}
    // Flush on pagehide and unmount so a reload within the 200ms debounce
    // window doesn't drop the last pan/zoom.
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  React.useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const zoomAt = (cx, cy, factor) => {
      const r = vp.getBoundingClientRect();
      const px = cx - r.left,
        py = cy - r.top;
      const t = tf.current;
      const next = Math.min(maxScale, Math.max(minScale, t.scale * factor));
      const k = next / t.scale;
      // --dc-inv-zoom consumers (.dc-sectionhead's CSS zoom, each section's
      // marginBottom) reflow on every scale change, vertically shifting the
      // world layout — so a world point mathematically pinned under the cursor
      // drifts as you zoom (content creeps up on zoom-in, down on zoom-out).
      // Anchor the DOM element under the cursor instead: record its screen Y,
      // apply the transform + --dc-inv-zoom, then cancel whatever vertical
      // drift the reflow introduced so it stays put on screen.
      let marker = null,
        markerY0 = 0;
      if (k !== 1) {
        const hit = document.elementFromPoint(cx, cy);
        marker = hit && hit.closest ? hit.closest('[data-dc-slot],[data-dc-section]') : null;
        if (marker) markerY0 = marker.getBoundingClientRect().top;
      }
      // keep the world point under the cursor fixed
      t.x = px - (px - t.x) * k;
      t.y = py - (py - t.y) * k;
      t.scale = next;
      apply();
      if (marker) {
        // A pure zoom around (cx, cy) maps screen Y → cy + (Y - cy) * k. Any
        // departure after the --dc-inv-zoom reflow is the layout drift.
        const drift = marker.getBoundingClientRect().top - (cy + (markerY0 - cy) * k);
        if (Math.abs(drift) > 0.1) {
          t.y -= drift;
          apply();
        }
      }
    };

    // Mouse-wheel vs trackpad-scroll heuristic. A physical wheel sends
    // line-mode deltas (Firefox) or large integer pixel deltas with no X
    // component (Chrome/Safari, typically multiples of 100/120). Trackpad
    // two-finger scroll sends small/fractional pixel deltas, often with
    // non-zero deltaX. ctrlKey is set by the browser for trackpad pinch.
    const isMouseWheel = e => e.deltaMode !== 0 || e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40;
    const onWheel = e => {
      e.preventDefault();
      if (isGesturing) return; // Safari: gesture* owns the pinch — discard concurrent wheels
      if ((e.ctrlKey || e.metaKey) && !isMouseWheel(e)) {
        // trackpad pinch, or ctrl/cmd + smooth-scroll mouse. Notched
        // wheels fall through to the fixed-step branch below.
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      } else if (isMouseWheel(e)) {
        // notched mouse wheel — fixed-ratio step per click
        zoomAt(e.clientX, e.clientY, Math.exp(-Math.sign(e.deltaY) * 0.18));
      } else {
        // trackpad two-finger scroll — pan
        tf.current.x -= e.deltaX;
        tf.current.y -= e.deltaY;
        apply();
      }
    };

    // Safari sends native gesture* events for trackpad pinch with a smooth
    // e.scale; preferring these over the ctrl+wheel fallback gives a much
    // better feel there. No-ops on other browsers. Safari also fires
    // ctrlKey wheel events during the same pinch — isGesturing makes
    // onWheel drop those entirely so they neither zoom nor pan.
    let gsBase = 1;
    let isGesturing = false;
    const onGestureStart = e => {
      e.preventDefault();
      isGesturing = true;
      gsBase = tf.current.scale;
    };
    const onGestureChange = e => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, gsBase * e.scale / tf.current.scale);
    };
    const onGestureEnd = e => {
      e.preventDefault();
      isGesturing = false;
    };

    // Drag-pan: middle button anywhere, or primary button on canvas
    // background (anything that isn't an artboard or an inline editor).
    let drag = null;
    const onPointerDown = e => {
      const onBg = !e.target.closest('[data-dc-slot], .dc-editable');
      if (!(e.button === 1 || e.button === 0 && onBg)) return;
      e.preventDefault();
      vp.setPointerCapture(e.pointerId);
      drag = {
        id: e.pointerId,
        lx: e.clientX,
        ly: e.clientY
      };
      vp.style.cursor = 'grabbing';
    };
    const onPointerMove = e => {
      if (!drag || e.pointerId !== drag.id) return;
      tf.current.x += e.clientX - drag.lx;
      tf.current.y += e.clientY - drag.ly;
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      apply();
    };
    const onPointerUp = e => {
      if (!drag || e.pointerId !== drag.id) return;
      vp.releasePointerCapture(e.pointerId);
      drag = null;
      vp.style.cursor = '';
    };

    // Host-driven zoom (toolbar % menu). Zooms around viewport centre so the
    // visible midpoint stays fixed — matching the host's iframe-zoom feel.
    const onHostMsg = e => {
      const d = e.data;
      if (d && d.type === '__dc_set_zoom' && typeof d.scale === 'number') {
        const r = vp.getBoundingClientRect();
        zoomAt(r.left + r.width / 2, r.top + r.height / 2, d.scale / tf.current.scale);
      } else if (d && d.type === '__dc_probe') {
        // Host's [readyGen] reset asks whether a canvas is present; it
        // fires on the iframe's native 'load', which for canvases with
        // images/fonts is after our mount-time announce, so re-announce.
        // Clear the pan-tick guard so apply() re-posts the current scale
        // even if it's unchanged — the host just reset dcScale to 1.
        window.parent.postMessage({
          type: '__dc_present'
        }, '*');
        lastPostedScale.current = undefined;
        apply();
      }
    };
    window.addEventListener('message', onHostMsg);
    // Announce canvas mode so the host toolbar proxies its % control here
    // instead of scaling the iframe element (which would just shrink the
    // viewport window of an infinite canvas). The apply() that follows emits
    // the initial __dc_zoom so the toolbar % is correct before first pinch.
    // lastPostedScale reset mirrors the __dc_probe handler: the layout
    // effect's restore-path apply() may already have posted the restored
    // scale (before __dc_present), so clear the guard to re-post it in order.
    window.parent.postMessage({
      type: '__dc_present'
    }, '*');
    lastPostedScale.current = undefined;
    apply();
    vp.addEventListener('wheel', onWheel, {
      passive: false
    });
    vp.addEventListener('gesturestart', onGestureStart, {
      passive: false
    });
    vp.addEventListener('gesturechange', onGestureChange, {
      passive: false
    });
    vp.addEventListener('gestureend', onGestureEnd, {
      passive: false
    });
    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('pointermove', onPointerMove);
    vp.addEventListener('pointerup', onPointerUp);
    vp.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('message', onHostMsg);
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('gesturestart', onGestureStart);
      vp.removeEventListener('gesturechange', onGestureChange);
      vp.removeEventListener('gestureend', onGestureEnd);
      vp.removeEventListener('pointerdown', onPointerDown);
      vp.removeEventListener('pointermove', onPointerMove);
      vp.removeEventListener('pointerup', onPointerUp);
      vp.removeEventListener('pointercancel', onPointerUp);
    };
  }, [apply, minScale, maxScale]);
  const gridSvg = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M120 0H0v120' fill='none' stroke='${encodeURIComponent(DC.grid)}' stroke-width='1'/%3E%3C/svg%3E")`;
  return /*#__PURE__*/React.createElement("div", {
    ref: vpRef,
    className: "design-canvas",
    style: {
      height: '100vh',
      width: '100vw',
      background: DC.bg,
      overflow: 'hidden',
      overscrollBehavior: 'none',
      touchAction: 'none',
      position: 'relative',
      fontFamily: DC.font,
      boxSizing: 'border-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: worldRef,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      transformOrigin: '0 0',
      willChange: 'transform',
      width: 'max-content',
      minWidth: '100%',
      minHeight: '100%',
      padding: '60px 0 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: -6000,
      backgroundImage: gridSvg,
      backgroundSize: '120px 120px',
      pointerEvents: 'none',
      zIndex: -1
    }
  }), children));
}

// ─────────────────────────────────────────────────────────────
// DCSection — editable title + h-row of artboards in persisted order
// ─────────────────────────────────────────────────────────────
function DCSection({
  id,
  title,
  subtitle,
  children,
  gap = 48
}) {
  const ctx = React.useContext(DCCtx);
  const sid = id ?? title;
  const all = React.Children.toArray(dcFlatten(children));
  const artboards = all.filter(c => c && c.type === DCArtboard);
  const rest = all.filter(c => !(c && c.type === DCArtboard));
  const sec = ctx && sid && ctx.section(sid) || {};
  // Must match DesignCanvas's srcKey computation exactly (it filters falsy
  // IDs), or onDelete persists a srcKey that DesignCanvas never recognizes.
  const allIds = artboards.map(a => a.props.id ?? a.props.label).filter(Boolean);
  const srcKey = allIds.join('\x1f');
  const hidden = sec.srcKey === srcKey ? sec.hidden || [] : [];
  const srcOrder = allIds.filter(k => !hidden.includes(k));
  const order = React.useMemo(() => {
    const kept = (sec.order || []).filter(k => srcOrder.includes(k));
    return [...kept, ...srcOrder.filter(k => !kept.includes(k))];
  }, [sec.order, srcOrder.join('|')]);
  const byId = Object.fromEntries(artboards.map(a => [a.props.id ?? a.props.label, a]));

  // marginBottom counter-scales so the on-screen gap between sections stays
  // constant — otherwise at low zoom the (world-space) gap collapses while
  // the screen-constant sectionhead below it doesn't, and the title reads as
  // belonging to the section above. paddingBottom below is just enough for
  // the 24px artboard-header (abs-positioned above each card) plus ~8px, so
  // the title sits tight against its own row at every zoom.
  return /*#__PURE__*/React.createElement("div", {
    "data-dc-section": sid,
    style: {
      marginBottom: 'calc(80px * var(--dc-inv-zoom, 1))',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 60px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-sectionhead",
    style: {
      paddingBottom: 36
    }
  }, /*#__PURE__*/React.createElement(DCEditable, {
    tag: "div",
    value: sec.title ?? title,
    onChange: v => ctx && sid && ctx.patchSection(sid, {
      title: v
    }),
    style: {
      fontSize: 28,
      fontWeight: 600,
      color: DC.title,
      letterSpacing: -0.4,
      marginBottom: 6,
      display: 'inline-block'
    }
  }), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      color: DC.subtitle
    }
  }, subtitle))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap,
      padding: '0 60px',
      alignItems: 'flex-start',
      width: 'max-content'
    }
  }, order.map(k => /*#__PURE__*/React.createElement(DCArtboardFrame, {
    key: k,
    sectionId: sid,
    artboard: byId[k],
    order: order,
    label: (sec.labels || {})[k] ?? byId[k].props.label,
    onRename: v => ctx && ctx.patchSection(sid, x => ({
      labels: {
        ...x.labels,
        [k]: v
      }
    })),
    onReorder: next => ctx && ctx.patchSection(sid, {
      order: next
    }),
    onDelete: () => ctx && ctx.patchSection(sid, x => ({
      hidden: [...(x.srcKey === srcKey ? x.hidden || [] : []), k],
      srcKey
    })),
    onFocus: () => ctx && ctx.setFocus(`${sid}/${k}`)
  }))), rest);
}

// DCArtboard — marker; rendered by DCArtboardFrame via DCSection.
function DCArtboard() {
  return null;
}

// Per-artboard export (kind: 'png' | 'html'). Both paths share the same
// self-contained clone: computed styles baked in, @font-face / <img> /
// inline-style background-image urls inlined as data URIs. PNG wraps the
// clone in foreignObject→canvas at 3× the artboard's natural width×height
// (same pipeline the host uses for page captures); HTML wraps it in a
// minimal standalone document. Both are independent of viewport zoom.
async function dcExport(node, w, h, name, kind) {
  try {
    await document.fonts.ready;
  } catch {}
  const toDataURL = url => fetch(url).then(r => r.blob()).then(b => new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => res(url);
    fr.readAsDataURL(b);
  })).catch(() => url);

  // Collect @font-face rules. ss.cssRules throws SecurityError on
  // cross-origin sheets (e.g. fonts.googleapis.com) — in that case fetch
  // the CSS text directly (those endpoints send ACAO:*) and regex-extract
  // the blocks. @import and @media/@supports are walked so nested
  // @font-face rules aren't missed.
  const fontRules = [],
    pending = [],
    seen = new Set();
  const scrapeCss = href => {
    if (seen.has(href)) return;
    seen.add(href);
    pending.push(fetch(href).then(r => r.text()).then(css => {
      for (const m of css.match(/@font-face\s*{[^}]*}/g) || []) fontRules.push({
        css: m,
        base: href
      });
      for (const m of css.matchAll(/@import\s+(?:url\()?['"]?([^'")\s;]+)/g)) scrapeCss(new URL(m[1], href).href);
    }).catch(() => {}));
  };
  const walk = (rules, base) => {
    for (const r of rules) {
      if (r.type === CSSRule.FONT_FACE_RULE) fontRules.push({
        css: r.cssText,
        base
      });else if (r.type === CSSRule.IMPORT_RULE && r.styleSheet) {
        const ibase = r.styleSheet.href || base;
        try {
          walk(r.styleSheet.cssRules, ibase);
        } catch {
          scrapeCss(ibase);
        }
      } else if (r.cssRules) walk(r.cssRules, base);
    }
  };
  for (const ss of document.styleSheets) {
    const base = ss.href || location.href;
    try {
      walk(ss.cssRules, base);
    } catch {
      if (ss.href) scrapeCss(ss.href);
    }
  }
  while (pending.length) await pending.shift();
  const fontCss = (await Promise.all(fontRules.map(async rule => {
    let out = rule.css,
      m;
    const re = /url\((['"]?)([^'")]+)\1\)/g;
    while (m = re.exec(rule.css)) {
      if (m[2].indexOf('data:') === 0) continue;
      let abs;
      try {
        abs = new URL(m[2], rule.base).href;
      } catch {
        continue;
      }
      out = out.split(m[0]).join('url("' + (await toDataURL(abs)) + '")');
    }
    return out;
  }))).join('\n');
  const cloneStyled = src => {
    if (src.nodeType === 8 || src.nodeType === 1 && src.tagName === 'SCRIPT') return document.createTextNode('');
    const dst = src.cloneNode(false);
    if (src.nodeType === 1) {
      const cs = getComputedStyle(src);
      let txt = '';
      for (let i = 0; i < cs.length; i++) txt += cs[i] + ':' + cs.getPropertyValue(cs[i]) + ';';
      dst.setAttribute('style', txt + 'animation:none;transition:none;');
      if (src.tagName === 'CANVAS') try {
        const im = document.createElement('img');
        im.src = src.toDataURL();
        im.setAttribute('style', txt);
        return im;
      } catch {}
    }
    for (let c = src.firstChild; c; c = c.nextSibling) dst.appendChild(cloneStyled(c));
    return dst;
  };
  const clone = cloneStyled(node);
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  // Drop the card's own shadow/radius so the export is a flush w×h rect;
  // the artboard's own background (if any) is already in the computed style.
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  const jobs = [];
  clone.querySelectorAll('img').forEach(el => {
    const s = el.getAttribute('src');
    if (s && s.indexOf('data:') !== 0) jobs.push(toDataURL(el.src).then(d => el.setAttribute('src', d)));
  });
  [clone, ...clone.querySelectorAll('*')].forEach(el => {
    const bg = el.style.backgroundImage;
    if (!bg) return;
    let m;
    const re = /url\(["']?([^"')]+)["']?\)/g;
    while (m = re.exec(bg)) {
      const tok = m[0],
        url = m[1];
      if (url.indexOf('data:') === 0) continue;
      jobs.push(toDataURL(url).then(d => {
        el.style.backgroundImage = el.style.backgroundImage.split(tok).join('url("' + d + '")');
      }));
    }
  });
  await Promise.all(jobs);
  const xml = new XMLSerializer().serializeToString(clone);
  const save = (blob, ext) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  if (kind === 'html') {
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + name + '</title>' + (fontCss ? '<style>' + fontCss + '</style>' : '') + '</head><body style="margin:0">' + xml + '</body></html>';
    return save(new Blob([html], {
      type: 'text/html'
    }), 'html');
  }

  // PNG: the SVG's own width/height must be the output resolution — an
  // <img>-loaded SVG rasterizes at its intrinsic size, so sizing it at 1×
  // and ctx.scale()-ing up would just upscale a 1× bitmap. viewBox maps the
  // w×h foreignObject onto the px·w × px·h SVG canvas so the browser renders
  // the HTML at full resolution.
  const px = 3;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w * px + '" height="' + h * px + '" viewBox="0 0 ' + w + ' ' + h + '"><foreignObject width="' + w + '" height="' + h + '">' + (fontCss ? '<style><![CDATA[' + fontCss + ']]></style>' : '') + xml + '</foreignObject></svg>';
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error('svg load failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const cv = document.createElement('canvas');
  cv.width = w * px;
  cv.height = h * px;
  cv.getContext('2d').drawImage(img, 0, 0);
  cv.toBlob(blob => save(blob, 'png'), 'image/png');
}
function DCArtboardFrame({
  sectionId,
  artboard,
  label,
  order,
  onRename,
  onReorder,
  onFocus,
  onDelete
}) {
  const {
    id: rawId,
    label: rawLabel,
    width = 260,
    height = 480,
    children,
    style = {}
  } = artboard.props;
  const id = rawId ?? rawLabel;
  const ref = React.useRef(null);
  const cardRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // ⋯ menu: close on any outside pointerdown. Two-click delete lives inside
  // the menu — first click arms the row, second commits; closing disarms.
  React.useEffect(() => {
    if (!menuOpen) {
      setConfirming(false);
      return;
    }
    const off = e => {
      if (!menuRef.current || !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [menuOpen]);
  const doExport = kind => {
    setMenuOpen(false);
    if (!cardRef.current) return;
    const name = String(label || id || 'artboard').replace(/[^\w\s.-]+/g, '_');
    dcExport(cardRef.current, width, height, name, kind).catch(e => console.error('[design-canvas] export failed:', e));
  };

  // Live drag-reorder: dragged card sticks to cursor; siblings slide into
  // their would-be slots in real time via transforms. DOM order only
  // changes on drop.
  const onGripDown = e => {
    e.preventDefault();
    e.stopPropagation();
    const me = ref.current;
    // translateX is applied in local (pre-scale) space but pointer deltas and
    // getBoundingClientRect().left are screen-space — divide by the viewport's
    // current scale so the dragged card tracks the cursor at any zoom level.
    const scale = me.getBoundingClientRect().width / me.offsetWidth || 1;
    const peers = Array.from(document.querySelectorAll(`[data-dc-section="${sectionId}"] [data-dc-slot]`));
    const homes = peers.map(el => ({
      el,
      id: el.dataset.dcSlot,
      x: el.getBoundingClientRect().left
    }));
    const slotXs = homes.map(h => h.x);
    const startIdx = order.indexOf(id);
    const startX = e.clientX;
    let liveOrder = order.slice();
    me.classList.add('dc-dragging');
    const layout = () => {
      for (const h of homes) {
        if (h.id === id) continue;
        const slot = liveOrder.indexOf(h.id);
        h.el.style.transform = `translateX(${(slotXs[slot] - h.x) / scale}px)`;
      }
    };
    const move = ev => {
      const dx = ev.clientX - startX;
      me.style.transform = `translateX(${dx / scale}px)`;
      const cur = homes[startIdx].x + dx;
      let nearest = 0,
        best = Infinity;
      for (let i = 0; i < slotXs.length; i++) {
        const d = Math.abs(slotXs[i] - cur);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      if (liveOrder.indexOf(id) !== nearest) {
        liveOrder = order.filter(k => k !== id);
        liveOrder.splice(nearest, 0, id);
        layout();
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      const finalSlot = liveOrder.indexOf(id);
      me.classList.remove('dc-dragging');
      me.style.transform = `translateX(${(slotXs[finalSlot] - homes[startIdx].x) / scale}px)`;
      // After the settle transition, kill transitions + clear transforms +
      // commit the reorder in the same frame so there's no visual snap-back.
      setTimeout(() => {
        for (const h of homes) {
          h.el.style.transition = 'none';
          h.el.style.transform = '';
        }
        if (liveOrder.join('|') !== order.join('|')) onReorder(liveOrder);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          for (const h of homes) h.el.style.transition = '';
        }));
      }, 180);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    "data-dc-slot": id,
    style: {
      position: 'relative',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-header",
    "data-omelette-chrome": "",
    style: {
      color: DC.label
    },
    onPointerDown: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-labelrow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-grip",
    onPointerDown: onGripDown,
    title: "Drag to reorder"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "13",
    viewBox: "0 0 9 13",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "11",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "11",
    r: "1.1"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-labeltext",
    onClick: onFocus,
    title: "Click to focus"
  }, /*#__PURE__*/React.createElement(DCEditable, {
    value: label,
    onChange: onRename,
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 15,
      fontWeight: 500,
      color: DC.label,
      lineHeight: 1
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-btns"
  }, /*#__PURE__*/React.createElement("div", {
    ref: menuRef,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "dc-kebab",
    title: "More",
    onClick: () => setMenuOpen(o => !o)
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2.5",
    cy: "6",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "6",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9.5",
    cy: "6",
    r: "1.1"
  }))), menuOpen && /*#__PURE__*/React.createElement("div", {
    className: "dc-menu",
    onPointerDown: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => doExport('png')
  }, "Download PNG"), /*#__PURE__*/React.createElement("button", {
    onClick: () => doExport('html')
  }, "Download HTML"), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("button", {
    className: "dc-danger",
    onClick: () => {
      if (confirming) {
        setMenuOpen(false);
        onDelete();
      } else setConfirming(true);
    }
  }, confirming ? 'Click again to delete' : 'Delete'))), /*#__PURE__*/React.createElement("button", {
    className: "dc-expand",
    onClick: onFocus,
    title: "Focus"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 1h4v4M5 11H1V7M11 1L7.5 4.5M1 11l3.5-3.5"
  }))))), /*#__PURE__*/React.createElement("div", {
    ref: cardRef,
    className: "dc-card",
    style: {
      borderRadius: 2,
      boxShadow: '0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06)',
      overflow: 'hidden',
      width,
      height,
      background: '#fff',
      ...style
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb',
      fontSize: 13,
      fontFamily: DC.font
    }
  }, id)));
}

// Inline rename — commits on blur or Enter.
function DCEditable({
  value,
  onChange,
  style,
  tag = 'span',
  onClick
}) {
  const T = tag;
  return /*#__PURE__*/React.createElement(T, {
    className: "dc-editable",
    contentEditable: true,
    suppressContentEditableWarning: true,
    onClick: onClick,
    onPointerDown: e => e.stopPropagation(),
    onBlur: e => onChange && onChange(e.currentTarget.textContent),
    onKeyDown: e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    style: style
  }, value);
}

// ─────────────────────────────────────────────────────────────
// Focus mode — overlay one artboard; ←/→ within section, ↑/↓ across
// sections, Esc or backdrop click to exit.
// ─────────────────────────────────────────────────────────────
function DCFocusOverlay({
  entry,
  sectionMeta,
  sectionOrder
}) {
  const ctx = React.useContext(DCCtx);
  const {
    sectionId,
    artboard
  } = entry;
  const sec = ctx.section(sectionId);
  const meta = sectionMeta[sectionId];
  const peers = meta.slotIds;
  const aid = artboard.props.id ?? artboard.props.label;
  const idx = peers.indexOf(aid);
  const secIdx = sectionOrder.indexOf(sectionId);
  const go = d => {
    const n = peers[(idx + d + peers.length) % peers.length];
    if (n) ctx.setFocus(`${sectionId}/${n}`);
  };
  const goSection = d => {
    // Sections whose artboards are all deleted have slotIds:[] — step past
    // them to the next non-empty section so ↑/↓ doesn't dead-end.
    const n = sectionOrder.length;
    for (let i = 1; i < n; i++) {
      const ns = sectionOrder[((secIdx + d * i) % n + n) % n];
      const first = sectionMeta[ns] && sectionMeta[ns].slotIds[0];
      if (first) {
        ctx.setFocus(`${ns}/${first}`);
        return;
      }
    }
  };
  React.useEffect(() => {
    const k = e => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goSection(-1);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        goSection(1);
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });
  const {
    width = 260,
    height = 480,
    children
  } = artboard.props;
  const [vp, setVp] = React.useState({
    w: window.innerWidth,
    h: window.innerHeight
  });
  React.useEffect(() => {
    const r = () => setVp({
      w: window.innerWidth,
      h: window.innerHeight
    });
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  const scale = Math.max(0.1, Math.min((vp.w - 200) / width, (vp.h - 260) / height, 2));
  const [ddOpen, setDd] = React.useState(false);
  const Arrow = ({
    dir,
    onClick
  }) => /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      onClick();
    },
    style: {
      position: 'absolute',
      top: '50%',
      [dir]: 28,
      transform: 'translateY(-50%)',
      border: 'none',
      background: 'rgba(255,255,255,.08)',
      color: 'rgba(255,255,255,.9)',
      width: 44,
      height: 44,
      borderRadius: 22,
      fontSize: 18,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background .15s'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.18)',
    onMouseLeave: e => e.currentTarget.style.background = 'rgba(255,255,255,.08)'
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: dir === 'left' ? 'M11 3L5 9l6 6' : 'M7 3l6 6-6 6'
  })));

  // Portal to body so position:fixed is the real viewport regardless of any
  // transform on DesignCanvas's ancestors (including the canvas zoom itself).
  return ReactDOM.createPortal(/*#__PURE__*/React.createElement("div", {
    onClick: () => ctx.setFocus(null),
    onWheel: e => e.preventDefault(),
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(24,20,16,.6)',
      backdropFilter: 'blur(14px)',
      fontFamily: DC.font,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 72,
      display: 'flex',
      alignItems: 'flex-start',
      padding: '16px 20px 0',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setDd(o => !o),
    style: {
      border: 'none',
      background: 'transparent',
      color: '#fff',
      cursor: 'pointer',
      padding: '6px 8px',
      borderRadius: 6,
      textAlign: 'left',
      fontFamily: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 600,
      letterSpacing: -0.3
    }
  }, meta.title), /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 11 11",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    style: {
      opacity: .7
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 4l3.5 3.5L9 4"
  }))), meta.subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      opacity: .6,
      fontWeight: 400,
      marginTop: 2
    }
  }, meta.subtitle)), ddOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      background: '#2a251f',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,.4)',
      padding: 4,
      minWidth: 200,
      zIndex: 10
    }
  }, sectionOrder.filter(sid => sectionMeta[sid].slotIds.length).map(sid => /*#__PURE__*/React.createElement("button", {
    key: sid,
    onClick: () => {
      setDd(false);
      const f = sectionMeta[sid].slotIds[0];
      if (f) ctx.setFocus(`${sid}/${f}`);
    },
    style: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      border: 'none',
      cursor: 'pointer',
      background: sid === sectionId ? 'rgba(255,255,255,.1)' : 'transparent',
      color: '#fff',
      padding: '8px 12px',
      borderRadius: 5,
      fontSize: 14,
      fontWeight: sid === sectionId ? 600 : 400,
      fontFamily: 'inherit'
    }
  }, sectionMeta[sid].title)))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => ctx.setFocus(null),
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.12)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent',
    style: {
      border: 'none',
      background: 'transparent',
      color: 'rgba(255,255,255,.7)',
      width: 32,
      height: 32,
      borderRadius: 16,
      fontSize: 20,
      cursor: 'pointer',
      lineHeight: 1,
      transition: 'background .12s'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 64,
      bottom: 56,
      left: 100,
      right: 100,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: width * scale,
      height: height * scale,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
      background: '#fff',
      borderRadius: 2,
      overflow: 'hidden',
      boxShadow: '0 20px 80px rgba(0,0,0,.4)'
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb'
    }
  }, aid))), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 14,
      fontWeight: 500,
      opacity: .85,
      textAlign: 'center'
    }
  }, (sec.labels || {})[aid] ?? artboard.props.label, /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: .5,
      marginLeft: 10,
      fontVariantNumeric: 'tabular-nums'
    }
  }, idx + 1, " / ", peers.length))), /*#__PURE__*/React.createElement(Arrow, {
    dir: "left",
    onClick: () => go(-1)
  }), /*#__PURE__*/React.createElement(Arrow, {
    dir: "right",
    onClick: () => go(1)
  }), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 8
    }
  }, peers.map((p, i) => /*#__PURE__*/React.createElement("button", {
    key: p,
    onClick: () => ctx.setFocus(`${sectionId}/${p}`),
    style: {
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      width: 6,
      height: 6,
      borderRadius: 3,
      background: i === idx ? '#fff' : 'rgba(255,255,255,.3)'
    }
  })))), document.body);
}

// ─────────────────────────────────────────────────────────────
// Post-it — absolute-positioned sticky note
// ─────────────────────────────────────────────────────────────
function DCPostIt({
  children,
  top,
  left,
  right,
  bottom,
  rotate = -2,
  width = 180
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top,
      left,
      right,
      bottom,
      width,
      background: DC.postitBg,
      padding: '14px 16px',
      fontFamily: '"Comic Sans MS", "Marker Felt", "Segoe Print", cursive',
      fontSize: 14,
      lineHeight: 1.4,
      color: DC.postitText,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
      transform: `rotate(${rotate}deg)`,
      zIndex: 5
    }
  }, children);
}
Object.assign(window, {
  DesignCanvas,
  DCSection,
  DCArtboard,
  DCPostIt
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "design-canvas.jsx", error: String((e && e.message) || e) }); }

// detail-cte.js
try { (() => {
/* global window, document */
// Fiscal · Detalhe do CT-e — document detail with SEFAZ event timeline. `ico` is global.

const content = `
<div class="page" data-screen-label="Detalhe do CT-e">
  <div class="detail-head">
    <div class="ph-icon">${ico('doc', 'ic6')}</div>
    <div class="dh-main">
      <p class="dh-eyebrow">Operação <span>›</span> CT-e <span>›</span> 000.1284</p>
      <div class="dh-title-row"><h1 class="dh-title">CT-e 000.1284 · Série 1</h1><span class="status-pill success">Autorizado</span></div>
      <p class="dh-sub">Chave 3526 0612 3456 7890 1234 5678 9012 3456 7890 8901</p>
    </div>
    <div class="dh-actions">
      <button class="btn btn-outline btn-icon" title="Baixar DACTE (PDF)">${ico('download', 'ic4')}</button>
      <button class="btn btn-outline">Carta de correção</button>
      <button class="btn btn-outline" style="color:var(--danger-ink);border-color:rgba(220,38,38,0.3)">Cancelar</button>
    </div>
  </div>

  <div class="detail-cols">
    <div>
      <div class="dcard">
        <div class="dcard-head"><h3>Partes</h3></div>
        <div class="dcard-body" style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
          <div class="party"><span class="pic">${ico('building', 'ic5')}</span><div><div class="pname">Transportadora Modelo LTDA</div><div class="pmeta">11.222.333/0001-44<br>Emitente (transportador)</div></div></div>
          <div class="party"><span class="pic">${ico('store', 'ic5')}</span><div><div class="pname">Autopeças União Ltda</div><div class="pmeta">São Paulo/SP<br>Remetente</div></div></div>
          <div class="party"><span class="pic">${ico('pin', 'ic5')}</span><div><div class="pname">CD Vale Verde Sul</div><div class="pmeta">Curitiba/PR<br>Destinatário</div></div></div>
          <div class="party"><span class="pic">${ico('userCircle', 'ic5')}</span><div><div class="pname">Indústria Vale Verde</div><div class="pmeta">45.678.901/0001-22<br>Tomador do serviço</div></div></div>
        </div>
      </div>

      <div class="dcard">
        <div class="dcard-head"><h3>Prestação &amp; tributos</h3></div>
        <div class="dcard-body"><div class="def-grid">
          <div class="def"><div class="k">CFOP</div><div class="v mono">6353 — Transporte (interestadual)</div></div>
          <div class="def"><div class="k">Natureza</div><div class="v">Prestação de serviço de transporte</div></div>
          <div class="def"><div class="k">Valor total da prestação</div><div class="v">R$ 4.863,64</div></div>
          <div class="def"><div class="k">Valor a receber</div><div class="v">R$ 4.863,64</div></div>
          <div class="def"><div class="k">Base de cálculo ICMS</div><div class="v">R$ 4.863,64</div></div>
          <div class="def"><div class="k">ICMS (12%)</div><div class="v">R$ 583,64</div></div>
          <div class="def"><div class="k">Protocolo de autorização</div><div class="v mono">135260612345678</div></div>
          <div class="def"><div class="k">Autorizado em</div><div class="v">09/06/2026 14:13:02</div></div>
        </div></div>
      </div>

      <div class="dcard">
        <div class="dcard-head"><h3>Documentos vinculados</h3></div>
        <div class="dcard-body" style="display:flex;flex-direction:column;gap:10px">
          <div class="party" style="align-items:center"><span class="pic" style="background:var(--warning-tint);color:var(--warning-ink)">${ico('docDup', 'ic5')}</span><div style="flex:1"><div class="pname">MDF-e 000.0712</div><div class="pmeta">Manifesto · Autorizado</div></div><span class="status-pill success" style="font-size:12px">OK</span></div>
          <div class="party" style="align-items:center"><span class="pic">${ico('truck', 'ic5')}</span><div style="flex:1"><div class="pname">Embarque EMB-2026-0461</div><div class="pmeta">Em trânsito</div></div><button class="btn btn-outline" style="height:32px;font-size:13px">Abrir</button></div>
        </div>
      </div>
    </div>

    <div class="summary-sticky">
      <div class="dcard">
        <div class="dcard-head"><h3>Eventos SEFAZ</h3></div>
        <div class="dcard-body">
          <div class="timeline">
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot success">${ico('docDup', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Vinculado ao MDF-e</div><div class="tl-meta">09/06/2026 14:20</div></div></div>
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot success">${ico('arrowR', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Autorizado o uso</div><div class="tl-meta">09/06/2026 14:13 · cStat 100</div><div class="tl-desc">Autorização de uso concedida pela SEFAZ-SP.</div></div></div>
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot info">${ico('doc', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Enviado para autorização</div><div class="tl-meta">09/06/2026 14:12</div></div></div>
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot muted">${ico('plus', 'ic4')}</div></div><div class="tl-body"><div class="tl-title">CT-e gerado</div><div class="tl-meta">09/06/2026 14:12 · Fábio Ogawa</div></div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'CT-e',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "detail-cte.js", error: String((e && e.message) || e) }); }

// detail-quote.js
try { (() => {
/* global window */
// Logística · Detalhe da Cotação — detail pattern on the shared shell. `ico` is global.

const FREIGHT = [['Frete-peso', 'SP → Curitiba · 408 km · 12.400 kg', 'R$ 4.000,00'], ['Ad valorem', '0,30% sobre R$ 180.000 (valor da carga)', 'R$ 540,00'], ['GRIS', 'Gerenciamento de risco · 0,10%', 'R$ 180,00'], ['Pedágio', '4 eixos · 6 praças', 'R$ 180,00'], ['Taxa de coleta', 'Coleta dedicada na origem', 'R$ 120,00']];
const TAXES = [['ICMS', '12% por dentro (PR)', 'R$ 583,64'], ['PIS', '0,65%', 'R$ 31,61'], ['COFINS', '3,00%', 'R$ 145,91']];
const COSTS = [['Combustível', '146 L · R$ 6,10/L (3,9 km/L)', 'R$ 890,60'], ['Motorista', 'Diária + comissão', 'R$ 520,00'], ['Manutenção/km', 'R$ 0,38/km · 408 km', 'R$ 155,04'], ['Pedágio (custo)', 'Repasse', 'R$ 180,00'], ['Custos fixos rateados', 'Frota + administrativo', 'R$ 885,02']];
function irow(name, sub, val, cls) {
  return `<tr><td><div class="it-name">${name}</div><div class="it-sub">${sub}</div></td><td class="num ${cls || ''}">${val}</td></tr>`;
}
const content = `
<div class="page" data-screen-label="Detalhe da Cotação">
  <div class="detail-head">
    <div class="ph-icon">${ico('doc', 'ic6')}</div>
    <div class="dh-main">
      <p class="dh-eyebrow">Vendas <span>›</span> Cotações <span>›</span> COT-2026-0461</p>
      <div class="dh-title-row">
        <h1 class="dh-title">COT-2026-0461</h1>
        <span class="status-pill success">Convertida</span>
      </div>
      <p class="dh-sub">Indústria Vale Verde · São Paulo/SP → Curitiba/PR · validade 12/06/2026</p>
    </div>
    <div class="dh-actions">
      <button class="btn btn-outline btn-icon" title="Baixar PDF">${ico('download', 'ic4')}</button>
      <button class="btn btn-outline btn-icon" title="Duplicar">${ico('docDup', 'ic4')}</button>
      <button class="btn btn-primary">${ico('truck', 'ic4')} Converter</button>
    </div>
  </div>

  <div class="tabbar">
    <button class="active" data-tab="precificacao">Precificação</button>
    <button data-tab="rota">Dados &amp; rota</button>
    <button data-tab="financeiro">Financeiro</button>
    <button data-tab="historico">Histórico</button>
  </div>

  <div class="tabpane active" id="precificacao">
    <div class="detail-cols">
      <div>
        <div class="dcard">
          <div class="dcard-head"><h3>Composição do frete</h3><span class="it-sub">5 itens</span></div>
          <table class="items">
            <thead><tr><th>Item</th><th class="num">Valor</th></tr></thead>
            <tbody>
              <tr class="group-head"><td colspan="2">Receita de frete</td></tr>
              ${FREIGHT.map(r => irow(r[0], r[1], r[2])).join('')}
              <tr class="group-head"><td colspan="2">Impostos sobre o frete</td></tr>
              ${TAXES.map(r => irow(r[0], r[1], r[2])).join('')}
              <tr class="group-head"><td colspan="2">Custos operacionais</td></tr>
              ${COSTS.map(r => irow(r[0], r[1], r[2])).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="summary-sticky">
        <div class="sum-card">
          <div class="sum-head"><h3>Análise crítica</h3></div>
          <div class="sum-body">
            <div class="sum-row"><span>Receita bruta</span><span class="v">R$ 5.020,00</span></div>
            <div class="sum-row sub"><span>Frete-peso + taxas</span><span class="v">R$ 5.020,00</span></div>
            <div class="sum-divider"></div>
            <div class="sum-row"><span>Impostos</span><span class="v">− R$ 761,16</span></div>
            <div class="sum-row"><span>Custos operacionais</span><span class="v">− R$ 2.630,66</span></div>
            <div class="sum-divider"></div>
            <div class="sum-total"><span class="lbl">Total ao cliente</span><span class="amt">R$ 5.020,00</span></div>
            <div class="sum-margin"><span class="lbl">Margem líquida</span><span class="amt">R$ 1.628,18 · 32,4%</span></div>
          </div>
          <div class="sum-foot"><button class="btn btn-primary" style="width:100%">Editar precificação</button></div>
        </div>
      </div>
    </div>
  </div>

  <div class="tabpane" id="rota">
    <div class="detail-cols">
      <div>
        <div class="dcard">
          <div class="dcard-head"><h3>Rota</h3></div>
          <div class="dcard-body">
            <div class="map-ph"><span class="pin-a"></span><span class="route"></span><span class="pin-b"></span>São Paulo/SP → Curitiba/PR · 408 km</div>
            <div class="def-grid" style="margin-top:16px">
              <div class="def"><div class="k">Origem</div><div class="v">São Paulo/SP — Vila Leopoldina</div></div>
              <div class="def"><div class="k">Destino</div><div class="v">Curitiba/PR — CIC</div></div>
              <div class="def"><div class="k">Distância</div><div class="v">408 km</div></div>
              <div class="def"><div class="k">Prazo estimado</div><div class="v">1 dia útil</div></div>
            </div>
          </div>
        </div>
        <div class="dcard">
          <div class="dcard-head"><h3>Carga</h3></div>
          <div class="dcard-body"><div class="def-grid">
            <div class="def"><div class="k">Mercadoria</div><div class="v">Autopeças (NF 12.4500)</div></div>
            <div class="def"><div class="k">Peso</div><div class="v">12.400 kg</div></div>
            <div class="def"><div class="k">Valor da carga</div><div class="v">R$ 180.000,00</div></div>
            <div class="def"><div class="k">Modalidade</div><div class="v">LCL · carga fracionada</div></div>
          </div></div>
        </div>
      </div>
      <div class="summary-sticky">
        <div class="dcard">
          <div class="dcard-head"><h3>Partes</h3></div>
          <div class="dcard-body" style="display:flex;flex-direction:column;gap:16px">
            <div class="party"><span class="pic">${ico('building', 'ic5')}</span><div><div class="pname">Indústria Vale Verde</div><div class="pmeta">45.678.901/0001-22<br>Tomador do frete</div></div></div>
            <div class="party"><span class="pic">${ico('store', 'ic5')}</span><div><div class="pname">Autopeças União Ltda</div><div class="pmeta">São Paulo/SP<br>Remetente</div></div></div>
            <div class="party"><span class="pic">${ico('pin', 'ic5')}</span><div><div class="pname">CD Vale Verde Sul</div><div class="pmeta">Curitiba/PR<br>Destinatário</div></div></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="tabpane" id="financeiro">
    <div class="dcard"><div class="dcard-head"><h3>Resumo financeiro</h3></div><div class="dcard-body"><div class="def-grid">
      <div class="def"><div class="k">Condição de pagamento</div><div class="v">Faturado · 28 dias</div></div>
      <div class="def"><div class="k">Forma</div><div class="v">Boleto bancário</div></div>
      <div class="def"><div class="k">CT-e vinculado</div><div class="v mono">000.1284 · Série 1</div></div>
      <div class="def"><div class="k">Fatura</div><div class="v">FAT-2026-0345 (em aberto)</div></div>
    </div></div></div>
  </div>

  <div class="tabpane" id="historico">
    <div class="dcard"><div class="dcard-head"><h3>Histórico da cotação</h3></div><div class="dcard-body">
      <div class="timeline">
        <div class="tl-item"><div class="tl-rail"><div class="tl-dot success">${ico('arrowR', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Convertida em embarque</div><div class="tl-meta">09/06/2026 14:12 · Fábio Ogawa</div><div class="tl-desc">Gerou o embarque EMB-2026-0461 e o CT-e 000.1284.</div></div></div>
        <div class="tl-item"><div class="tl-rail"><div class="tl-dot info">${ico('doc', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Aprovada pelo cliente</div><div class="tl-meta">08/06/2026 16:40</div></div></div>
        <div class="tl-item"><div class="tl-rail"><div class="tl-dot muted">${ico('doc', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Proposta enviada</div><div class="tl-meta">08/06/2026 09:15 · Juliana Prado</div></div></div>
        <div class="tl-item"><div class="tl-rail"><div class="tl-dot muted">${ico('plus', 'ic4')}</div></div><div class="tl-body"><div class="tl-title">Cotação criada</div><div class="tl-meta">07/06/2026 11:02 · Juliana Prado</div></div></div>
      </div>
    </div></div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Cotações',
  content
});
document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabbar button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === b.dataset.tab));
}));
})(); } catch (e) { __ds_ns.__errors.push({ path: "detail-quote.js", error: String((e && e.message) || e) }); }

// detail-trip.js
try { (() => {
/* global window */
// Logística · Detalhe da Viagem — operational detail + stops timeline. `ico` is global.

const content = `
<div class="page" data-screen-label="Detalhe da Viagem">
  <div class="detail-head">
    <div class="ph-icon">${ico('map', 'ic6')}</div>
    <div class="dh-main">
      <p class="dh-eyebrow">Operação <span>›</span> Viagens <span>›</span> VG-2026-0207</p>
      <div class="dh-title-row"><h1 class="dh-title">VG-2026-0207</h1><span class="status-pill warning">Em andamento</span></div>
      <p class="dh-sub">Scania R450 · ABC1D23 · Motorista: Rafael Lima · São Paulo/SP → Curitiba/PR</p>
    </div>
    <div class="dh-actions">
      <button class="btn btn-outline btn-icon" title="Imprimir">${ico('download', 'ic4')}</button>
      <button class="btn btn-outline">Registrar evento</button>
      <button class="btn btn-primary">Concluir viagem</button>
    </div>
  </div>

  <div class="detail-cols">
    <div>
      <div class="dcard">
        <div class="dcard-head"><h3>Trajeto</h3><span class="it-sub">408 km · 2 paradas</span></div>
        <div class="dcard-body">
          <div class="map-ph"><span class="pin-a"></span><span class="route"></span><span class="pin-b"></span>São Paulo/SP → Curitiba/PR</div>
        </div>
      </div>

      <div class="dcard">
        <div class="dcard-head"><h3>Progresso da viagem</h3></div>
        <div class="dcard-body">
          <div class="timeline">
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot success">${ico('arrowR', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Saída da origem — São Paulo/SP</div><div class="tl-meta">09/06/2026 06:10 · KM 0</div><div class="tl-desc">Carga conferida e lacrada. MDF-e 000.0712 autorizado.</div></div></div>
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot success">${ico('pin', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Pedágio Régis Bittencourt</div><div class="tl-meta">09/06/2026 08:42 · KM 122</div></div></div>
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot info">${ico('truck', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Em trânsito — BR-116</div><div class="tl-meta">Última posição: 11:58 · KM 263</div><div class="tl-desc">Velocidade média 58 km/h · ETA Curitiba 14:30.</div></div></div>
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot muted">${ico('pin', 'ic4')}</div></div><div class="tl-body"><div class="tl-title">Entrega — Curitiba/PR (CD Vale Verde Sul)</div><div class="tl-meta">Previsto 09/06/2026 14:30 · KM 408</div></div></div>
          </div>
        </div>
      </div>
    </div>

    <div class="summary-sticky">
      <div class="dcard">
        <div class="dcard-head"><h3>Resumo</h3></div>
        <div class="dcard-body"><div class="def-grid" style="grid-template-columns:1fr 1fr">
          <div class="def"><div class="k">Distância</div><div class="v">408 km</div></div>
          <div class="def"><div class="k">Percorrido</div><div class="v">263 km · 64%</div></div>
          <div class="def"><div class="k">Veículo</div><div class="v mono">ABC1D23</div></div>
          <div class="def"><div class="k">Motorista</div><div class="v">Rafael Lima</div></div>
          <div class="def"><div class="k">Embarque</div><div class="v">EMB-2026-0461</div></div>
          <div class="def"><div class="k">CT-e</div><div class="v mono">000.1284</div></div>
        </div></div>
      </div>
      <div class="dcard">
        <div class="dcard-head"><h3>Custos da viagem</h3></div>
        <div class="dcard-body">
          <div class="sum-row"><span>Combustível (est.)</span><span class="v">R$ 890,60</span></div>
          <div class="sum-row" style="margin-top:8px"><span>Pedágio</span><span class="v">R$ 180,00</span></div>
          <div class="sum-row" style="margin-top:8px"><span>Diária motorista</span><span class="v">R$ 320,00</span></div>
          <div class="sum-divider" style="margin:12px 0"></div>
          <div class="sum-total"><span class="lbl">Custo total</span><span class="amt" style="font-size:18px">R$ 1.390,60</span></div>
        </div>
      </div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Viagens',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "detail-trip.js", error: String((e && e.message) || e) }); }

// directory-clients.js
try { (() => {
/* global window, document */
// Diretório · Clientes — list page content on the shared app shell.
// `ico` is provided globally by app-shell.js.

const CLIENTS = [{
  name: 'Transportes Aurora LTDA',
  doc: '12.345.678/0001-90',
  fase: 'Cliente ativo',
  macro: 'Conversão',
  loc: 'Curitiba/PR',
  tel: '(41) 99876-5432',
  email: 'compras@aurora.com.br',
  credito: 'R$ 120.000,00',
  status: ['success', 'Ativo'],
  at: '08/06/2026'
}, {
  name: 'Distribuidora Pampa S.A.',
  doc: '98.765.432/0001-10',
  fase: 'Negociação',
  macro: 'Oportunidade',
  loc: 'Porto Alegre/RS',
  tel: '(51) 3214-7788',
  email: 'logistica@pampa.com',
  credito: 'R$ 80.000,00',
  status: ['success', 'Ativo'],
  at: '07/06/2026'
}, {
  name: 'Indústria Vale Verde',
  doc: '45.678.901/0001-22',
  fase: 'Proposta enviada',
  macro: 'Oportunidade',
  loc: 'Belo Horizonte/MG',
  tel: '(31) 98123-4455',
  email: 'suprimentos@valeverde.ind.br',
  credito: 'R$ 200.000,00',
  status: ['warning', 'Pendente'],
  at: '06/06/2026'
}, {
  name: 'Comercial Litoral Norte',
  doc: '23.456.789/0001-33',
  fase: 'Cliente ativo',
  macro: 'Conversão',
  loc: 'Santos/SP',
  tel: '(13) 3344-2211',
  email: 'fretes@litoralnorte.com',
  credito: 'Não definido',
  status: ['success', 'Ativo'],
  at: '05/06/2026'
}, {
  name: 'AgroSul Cooperativa',
  doc: '34.567.890/0001-44',
  fase: 'Lead qualificado',
  macro: 'Prospecção',
  loc: 'Cascavel/PR',
  tel: '(45) 99988-1122',
  email: 'transporte@agrosul.coop.br',
  credito: 'R$ 50.000,00',
  status: ['secondary', 'Inativo'],
  at: '03/06/2026'
}, {
  name: 'Metalúrgica Horizonte',
  doc: '56.789.012/0001-55',
  fase: 'Em recuperação',
  macro: 'Retenção',
  loc: 'Joinville/SC',
  tel: '(47) 3030-9090',
  email: 'expedicao@horizonte.com.br',
  credito: 'R$ 35.000,00',
  status: ['error', 'Bloqueado'],
  at: '01/06/2026'
}, {
  name: 'Atacadão Primavera',
  doc: '67.890.123/0001-66',
  fase: 'Cliente ativo',
  macro: 'Conversão',
  loc: 'Goiânia/GO',
  tel: '(62) 99111-2233',
  email: 'compras@primavera.com',
  credito: 'R$ 95.000,00',
  status: ['success', 'Ativo'],
  at: '31/05/2026'
}];
function row(c) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar">${ico('building', 'ic5')}</span><div style="min-width:0"><div class="name">${c.name}</div><div class="doc">${c.doc}</div></div></div></td>
    <td><div style="display:flex;flex-direction:column;gap:2px"><span class="badge warning">${c.fase}</span><span class="cell-sub">${c.macro}</span></div></td>
    <td><span class="cell-locality">${ico('pin', 'ic4')}${c.loc}</span></td>
    <td><div class="cell-contact">${c.tel}<br>${c.email}</div></td>
    <td class="cell-num">${c.credito}</td>
    <td><span class="badge ${c.status[0]}">${c.status[1]}</span></td>
    <td class="cell-date">${c.at}</td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="Clientes">
  <div class="page-head">
    <div class="ph-icon">${ico('building', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Vendas <span>›</span> Clientes</p>
      <h1 class="ph-title">Clientes</h1>
      <p class="ph-desc">Tomadores de frete e clientes comerciais: fase, localidade, contato, limite de crédito e última atualização.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Nova Empresa</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por nome, fantasia ou documento..." /></div>
    <button class="btn btn-soft">Buscar</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros <span class="filter-count">2</span></button>
    <button class="btn btn-outline">${ico('download', 'ic4')} Exportar</button>
  </div>

  <p class="list-summary">Mostrando <strong>7</strong> de <strong>128</strong> empresas</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Empresa')}</th>
          <th>${sortable('Fase comercial')}</th>
          <th>${sortable('Localidade')}</th>
          <th>Contato</th>
          <th>${sortable('Limite crédito')}</th>
          <th>${sortable('Status')}</th>
          <th>${sortable('Atualizado')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${CLIENTS.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option><option>100</option></select></div>
      <div class="pg-nav">
        <button class="pg-btn" disabled>‹</button>
        <button class="pg-btn active">1</button>
        <button class="pg-btn">2</button>
        <button class="pg-btn">3</button>
        <span class="pg-info">…</span>
        <button class="pg-btn">6</button>
        <button class="pg-btn">›</button>
      </div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Cadastros',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "directory-clients.js", error: String((e && e.message) || e) }); }

// finance-account-form.js
try { (() => {
/* global window */
// Financeiro · Nova conta a pagar — form-page pattern on the shared shell. `ico` is global.

const content = `
<div class="page form-wrap" data-screen-label="Nova conta a pagar">
  <div class="page-head">
    <div class="ph-icon">${ico('wallet', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Financeiro <span>›</span> Contas a Pagar <span>›</span> Nova</p>
      <h1 class="ph-title">Nova conta a pagar</h1>
      <p class="ph-desc">Registre uma obrigação: valor, vencimento, categoria e forma de pagamento. Lançamentos da operação alimentam o caixa automaticamente.</p>
    </div>
    <div class="seg"><button class="active">Conta única</button><button>Parcelada</button></div>
  </div>

  <div class="form-card">
    <div class="form-section-head"><h3>Dados da conta</h3><p>Identificação e classificação da despesa.</p></div>
    <div class="form-body">
      <div class="form-grid">
        <div class="field col-2"><label>Descrição <span class="req">*</span></label><input type="text" placeholder="Ex.: Abastecimento frota — junho" /></div>
        <div class="field"><label>Categoria <span class="req">*</span></label><select><option>Combustível</option><option>Manutenção</option><option>Salários e encargos</option><option>Impostos e taxas</option><option>Fornecedores</option><option>Pedágio</option><option>Outros</option></select></div>
        <div class="field"><label>Fornecedor</label><select><option>Posto Rede Sul LTDA</option><option>Oficina Central Diesel</option><option>Pneus &amp; Cia</option><option>— Sem fornecedor —</option></select></div>
        <div class="field"><label>Valor <span class="req">*</span></label><div class="prefix-wrap"><span class="prefix">R$</span><input type="text" inputmode="decimal" placeholder="0,00" value="4.250,00" /></div></div>
        <div class="field"><label>Vencimento <span class="req">*</span></label><input type="text" placeholder="dd/mm/aaaa" value="20/06/2026" /></div>
        <div class="field"><label>Competência</label><input type="text" placeholder="dd/mm/aaaa" value="09/06/2026" /></div>
        <div class="field"><label>Centro de custo</label><select><option>Operação — Frota</option><option>Administrativo</option><option>Comercial</option></select></div>
      </div>
    </div>
  </div>

  <div class="form-card">
    <div class="form-section-head"><h3>Pagamento</h3><p>Conta, forma e status do pagamento.</p></div>
    <div class="form-body">
      <div class="form-grid">
        <div class="field"><label>Conta bancária</label><select><option>Banco do Brasil — Ag 1234 / CC 56789-0</option><option>Itaú — Ag 4321 / CC 09876-5</option><option>Caixa Operacional</option></select></div>
        <div class="field"><label>Forma de pagamento</label><select><option>Boleto</option><option>PIX</option><option>Transferência (TED)</option><option>Cartão</option></select></div>
        <div class="field"><label>Status</label><select><option>Em aberto</option><option>Pago</option><option>Agendado</option><option>Vencido</option></select></div>
        <div class="field"><label>Documento / NF</label><input type="text" placeholder="Nº do documento" /></div>
      </div>
    </div>
  </div>

  <div class="form-card">
    <div class="form-section-head"><h3>Complemento</h3><p>Observações e anexos (opcional).</p></div>
    <div class="form-body">
      <div class="form-grid">
        <div class="field col-2"><label>Observações</label><textarea placeholder="Notas internas sobre esta conta…"></textarea></div>
        <div class="field col-2"><label>Anexos</label><div class="dropzone">${ico('download', 'ic6')}Arraste comprovantes/boletos aqui ou clique para enviar<br><span class="hint">PDF, JPG ou PNG até 10 MB</span></div></div>
      </div>
    </div>
  </div>

  <div class="form-actions">
    <button class="btn btn-outline">Cancelar</button>
    <button class="btn btn-soft">Salvar e novo</button>
    <button class="btn btn-primary">Salvar conta</button>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Financeiro',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "finance-account-form.js", error: String((e && e.message) || e) }); }

// fiscal-cte-list.js
try { (() => {
/* global window */
// Fiscal · CT-e — list page on the shared shell. `ico` is global (app-shell.js).

const CTES = [{
  num: '000.1284',
  serie: '1',
  chave: '3526 0612 3456 …8901',
  rem: 'Transportes Aurora LTDA',
  dest: 'Indústria Vale Verde',
  emb: 'EMB-2026-0461',
  valor: 'R$ 4.863,64',
  emiss: '09/06/2026',
  st: ['success', 'Autorizado']
}, {
  num: '000.1283',
  serie: '1',
  chave: '3526 0612 3456 …8842',
  rem: 'Distribuidora Pampa S.A.',
  dest: 'Atacadão Primavera',
  emb: 'EMB-2026-0460',
  valor: 'R$ 7.210,00',
  emiss: '09/06/2026',
  st: ['warning', 'Processando']
}, {
  num: '000.1282',
  serie: '1',
  chave: '3526 0612 3456 …8773',
  rem: 'AgroSul Cooperativa',
  dest: 'Comercial Litoral Norte',
  emb: 'EMB-2026-0458',
  valor: 'R$ 2.940,50',
  emiss: '08/06/2026',
  st: ['error', 'Rejeitado']
}, {
  num: '000.1281',
  serie: '1',
  chave: '3526 0612 3456 …8714',
  rem: 'Metalúrgica Horizonte',
  dest: 'Transportes Aurora LTDA',
  emb: 'EMB-2026-0455',
  valor: 'R$ 5.120,00',
  emiss: '08/06/2026',
  st: ['success', 'Autorizado']
}, {
  num: '000.1280',
  serie: '1',
  chave: '3526 0612 3456 …8655',
  rem: 'Indústria Vale Verde',
  dest: 'Distribuidora Pampa S.A.',
  emb: 'EMB-2026-0451',
  valor: 'R$ 9.880,30',
  emiss: '07/06/2026',
  st: ['secondary', 'Cancelado']
}, {
  num: '000.1279',
  serie: '1',
  chave: '3526 0612 3456 …8596',
  rem: 'Atacadão Primavera',
  dest: 'AgroSul Cooperativa',
  emb: 'EMB-2026-0449',
  valor: 'R$ 3.450,00',
  emiss: '07/06/2026',
  st: ['error', 'Denegado']
}];
function row(c) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar">${ico('doc', 'ic5')}</span><div style="min-width:0"><div class="name">CT-e ${c.num} · Série ${c.serie}</div><div class="doc">${c.chave}</div></div></div></td>
    <td><div class="cell-contact"><strong style="color:var(--fg);font-weight:600">${c.rem}</strong><br>→ ${c.dest}</div></td>
    <td><span class="cell-num">${c.emb}</span></td>
    <td class="cell-num">${c.valor}</td>
    <td class="cell-date">${c.emiss}</td>
    <td><span class="badge ${c.st[0]}">${c.st[1]}</span></td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="CT-e">
  <div class="page-head">
    <div class="ph-icon">${ico('doc', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Operação <span>›</span> CT-e</p>
      <h1 class="ph-title">CT-e</h1>
      <p class="ph-desc">Conhecimentos de transporte eletrônicos: emissão, status na SEFAZ, carta de correção e cancelamento.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Emitir CT-e</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por chave, número ou tomador..." /></div>
    <button class="btn btn-soft">Mês atual</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros <span class="filter-count">1</span></button>
    <button class="btn btn-outline">${ico('download', 'ic4')} Exportar</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> de <strong>342</strong> documentos · período <strong>jun/2026</strong></p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Documento')}</th>
          <th>Remetente / Destinatário</th>
          <th>Embarque</th>
          <th>${sortable('Valor')}</th>
          <th>${sortable('Emissão')}</th>
          <th>${sortable('Status')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${CTES.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>20</option><option>50</option><option>100</option></select></div>
      <div class="pg-nav">
        <button class="pg-btn" disabled>‹</button>
        <button class="pg-btn active">1</button>
        <button class="pg-btn">2</button>
        <button class="pg-btn">3</button>
        <span class="pg-info">…</span>
        <button class="pg-btn">18</button>
        <button class="pg-btn">›</button>
      </div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'CT-e',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "fiscal-cte-list.js", error: String((e && e.message) || e) }); }

// fleet-vehicles-list.js
try { (() => {
/* global window */
// Frota · Veículos — list page on the shared shell. `ico` is global.

const VEHICLES = [{
  placa: 'ABC1D23',
  modelo: 'Scania R450',
  tipo: 'Cavalo mecânico',
  km: '412.350 km',
  manut: '09/2026',
  docs: ['success', 'Em dia'],
  st: ['warning', 'Em viagem']
}, {
  placa: 'DEF4G56',
  modelo: 'Volvo FH 540',
  tipo: 'Cavalo mecânico',
  km: '287.100 km',
  manut: '07/2026',
  docs: ['success', 'Em dia'],
  st: ['success', 'Disponível']
}, {
  placa: 'GHI7J89',
  modelo: 'Randon SR',
  tipo: 'Carreta (semirreboque)',
  km: '198.420 km',
  manut: '11/2026',
  docs: ['success', 'Em dia'],
  st: ['success', 'Disponível']
}, {
  placa: 'JKL0M12',
  modelo: 'VW Constellation 24.280',
  tipo: 'Truck',
  km: '356.880 km',
  manut: 'Em andamento',
  docs: ['warning', 'Vence em 12d'],
  st: ['error', 'Manutenção']
}, {
  placa: 'MNO3P45',
  modelo: 'Mercedes Accelo 1016',
  tipo: 'VUC',
  km: '141.260 km',
  manut: '08/2026',
  docs: ['warning', 'Vence em 12d'],
  st: ['success', 'Disponível']
}, {
  placa: 'PQR6S78',
  modelo: 'Librelato LS',
  tipo: 'Carreta (semirreboque)',
  km: '233.910 km',
  manut: '—',
  docs: ['error', 'Vencido'],
  st: ['secondary', 'Inativo']
}];
function row(v) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar" style="background:#fef3c7;color:#92400e">${ico('truck', 'ic5')}</span><div style="min-width:0"><div class="name" style="font-variant-numeric:tabular-nums">${v.placa}</div><div class="doc" style="font-family:inherit">${v.modelo}</div></div></div></td>
    <td><span class="cell-num" style="color:var(--fg-muted)">${v.tipo}</span></td>
    <td><span class="badge ${v.st[0]}">${v.st[1]}</span></td>
    <td class="cell-num">${v.km}</td>
    <td class="cell-date">${v.manut}</td>
    <td><span class="badge ${v.docs[0]}">${v.docs[1]}</span></td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="Veículos">
  <div class="page-head">
    <div class="ph-icon">${ico('truck', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Frota <span>›</span> Veículos</p>
      <h1 class="ph-title">Veículos</h1>
      <p class="ph-desc">Frota própria e agregada: placa, tipo, status operacional, odômetro e situação documental (licenciamento, manutenção).</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Novo veículo</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por placa, modelo ou tipo..." /></div>
    <button class="btn btn-soft">Buscar</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros</button>
    <button class="btn btn-outline">${ico('download', 'ic4')} Exportar</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> de <strong>34</strong> veículos</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Veículo')}</th>
          <th>Tipo</th>
          <th>${sortable('Status')}</th>
          <th>${sortable('Odômetro')}</th>
          <th>Próx. manutenção</th>
          <th>Documentos</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${VEHICLES.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option></select></div>
      <div class="pg-nav">
        <button class="pg-btn" disabled>‹</button>
        <button class="pg-btn active">1</button>
        <button class="pg-btn">2</button>
        <button class="pg-btn">›</button>
      </div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Frota',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "fleet-vehicles-list.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/03-dashboard/dashboard-app.js
try { (() => {
/* global document */
// HiperTMS — App Shell + Dashboard (hi-fi). Data-driven sidebar/topbar/dashboard.

const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  docDup: '<rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h6"/>',
  map: '<path d="m9 5-6 2.4V20l6-2.4 6 2.4 6-2.4V5l-6 2.4z"/><path d="M9 5v12.6M15 7.4V20"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6 6 0 0 1 11.6 0"/>',
  store: '<path d="M2 7l1.5-3h17L22 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M16 6l2 2M19 3l2 2"/>',
  bolt: '<path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>'
};
function ico(name, cls) {
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const QUICK = [['doc', 'Cotações'], ['truck', 'Embarques'], ['clipboard', 'Cargas'], ['map', 'Viagens'], ['doc', 'CT-e'], ['docDup', 'MDF-e']];
const HUBS = [['trending', 'Vendas'], ['truck', 'Operação'], ['building', 'Cadastros'], ['wrench', 'Frota'], ['cart', 'Compras'], ['wallet', 'Financeiro'], ['users', 'Equipes'], ['layers', 'Precificação']];
const SYSTEM = [['chart', 'Administração'], ['userCircle', 'Minha Conta'], ['store', 'Dados da Empresa'], ['users', 'Usuários'], ['card', 'Assinatura e Cobrança'], ['wrench', 'Configuração da operação'], ['key', 'Sequenciadores'], ['bolt', 'Automação']];
function navRow(icon, label, active) {
  return `<button class="navrow${active ? ' active' : ''}" type="button">
    <span class="navicon">${active ? '<span class="dot"></span>' : ''}${ico(icon, 'ic5')}</span>
    <span class="navlabel">${label}</span>
  </button>`;
}
const SYS_ITEMS = `<div class="sys-items" id="sys-items">${SYSTEM.map(([i, l]) => navRow(i, l, false)).join('')}</div>`;
const sidebar = `
  <aside class="sidebar">
    <div class="sb-head"><span class="wm"><span class="h">Hiper</span><span class="t">TMS</span></span></div>
    <div class="sb-scroll">
      <p class="sb-grouplabel">Acesso rápido</p>
      ${QUICK.map(([i, l]) => navRow(i, l, false)).join('')}
      <div class="sb-divider"></div>
      ${HUBS.map(([i, l]) => navRow(i, l, false)).join('')}
    </div>
    <div class="sb-foot">
      <button class="navrow sys-toggle" type="button" id="sys-toggle">
        <span class="navicon">${ico('chart', 'ic5')}</span>
        <span class="navlabel">Sistema</span>
        <span class="navchev">${ico('chevD', 'ic4')}</span>
      </button>
      ${SYS_ITEMS}
      <div class="sb-version">HiperTMS v12</div>
    </div>
  </aside>`;
const topbar = `
  <header class="topbar">
    <div class="tb-left">
      <button class="tenant"><span class="tenant-logo">TM</span><span class="tenant-name">Transportadora Modelo LTDA</span>${ico('chevR', 'ic4 muted')}</button>
    </div>
    <div class="tb-center">
      ${ico('calendar', 'ic4 muted')}
      <span class="dt"><span>Segunda-feira</span><span class="sep">|</span><span class="nums">09/06/2026</span><span class="sep">·</span><span class="nums">14:30</span></span>
    </div>
    <div class="tb-right">
      <button class="iconbtn">${ico('chat', 'ic5')}</button>
      <button class="iconbtn">${ico('bell', 'ic5')}<span class="reddot"></span></button>
      <button class="iconbtn">${ico('moon', 'ic5')}</button>
      <button class="avatar">FO</button>
    </div>
  </header>`;

// ---- Dashboard content ----
function statusColor(key) {
  if (/CANCEL|REJECT|EXPIR/.test(key)) return 'hsl(350 70% 52%)';
  if (/PENDING|DRAFT|OPEN|PLANNED/.test(key)) return 'hsl(262 65% 52%)';
  if (/PROGRESS|TRANSIT|SCHEDULED/.test(key)) return 'hsl(38 92% 48%)';
  if (/APPROVED|DELIVERED|COMPLETED|DISPATCHED/.test(key)) return 'hsl(152 55% 38%)';
  if (/CONVERTED|CLOSED/.test(key)) return 'hsl(200 75% 42%)';
  return 'hsl(220 14% 46%)';
}
const PANELS = [{
  title: 'Cotações',
  foot: 'Ver cotações',
  data: [['DRAFT', 'Rascunho', 8], ['OPEN', 'Aberta', 14], ['APPROVED', 'Aprovada', 6], ['CONVERTED', 'Convertida', 11], ['REJECTED', 'Rejeitada', 3], ['EXPIRED', 'Expirada', 2]]
}, {
  title: 'Embarques',
  foot: 'Ver Embarques',
  data: [['PICKUP_PENDING', 'Coleta pend.', 5], ['PICKUP_SCHEDULED', 'Coleta agend.', 7], ['IN_TRANSIT', 'Em trânsito', 9], ['IN_STORAGE', 'Em armazém', 4], ['DELIVERED', 'Entregue', 22], ['CANCELLED', 'Cancelado', 2]]
}, {
  title: 'Cargas',
  foot: 'Ver Cargas',
  data: [['OPEN', 'Aberta', 6], ['CLOSED', 'Fechada', 4], ['DISPATCHED', 'Expedida', 10], ['CANCELLED', 'Cancelada', 1]]
}, {
  title: 'Viagens',
  foot: 'Ver Viagens',
  data: [['PLANNED', 'Planejada', 4], ['IN_PROGRESS', 'Em and.', 6], ['COMPLETED', 'Concluída', 18], ['CLOSED', 'Fechada', 9], ['CANCELLED', 'Cancelada', 2]]
}];
function barChart(data) {
  const max = Math.max(...data.map(d => d[2]), 1);
  return `<div class="barchart">${data.map(([k, lab, v]) => `
    <div class="barcol">
      <span class="barval">${v}</span>
      <div class="bartrack"><div class="bar" style="height:${Math.round(v / max * 100)}%;background:${statusColor(k)};"></div></div>
      <span class="barlabel">${lab}</span>
    </div>`).join('')}</div>`;
}
const panelsHtml = `<div class="panels">${PANELS.map(p => `
  <div class="panel">
    <div class="panel-head"><h3>${p.title}</h3></div>
    <div class="panel-body">${barChart(p.data)}</div>
    <button class="panel-foot">${p.foot} ${ico('arrowR', 'ic4')}</button>
  </div>`).join('')}</div>`;

// Time series area chart (SVG)
const series = [12, 18, 15, 24, 21, 28, 26, 34, 30, 38, 35, 42];
function areaChart() {
  const w = 520,
    h = 200,
    pad = 8;
  const max = Math.max(...series),
    min = 0;
  const stepX = (w - pad * 2) / (series.length - 1);
  const pts = series.map((v, i) => [pad + i * stepX, h - pad - (v - min) / (max - min) * (h - pad * 2)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ` L${(w - pad).toFixed(1)} ${h - pad} L${pad} ${h - pad} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="area">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a1f" stop-opacity="0.22"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#ag)"/><path d="${line}" fill="none" stroke="#ff5a1f" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="#ff5a1f"/>`).join('')}
  </svg>`;
}
function donut(segments, centerLabel) {
  let acc = 0;
  const stops = [];
  const total = segments.reduce((s, x) => s + x[2], 0);
  segments.forEach(([,, v, c]) => {
    const a = v / total * 360;
    stops.push(`${c} ${acc}deg ${acc + a}deg`);
    acc += a;
  });
  return `<div class="donut-wrap">
    <div class="donut" style="background:conic-gradient(${stops.join(',')});"><div class="donut-hole"><span class="donut-total">${total}</span><span class="donut-cap">${centerLabel}</span></div></div>
    <ul class="legend">${segments.map(([, lab, v, c]) => `<li><span class="lg-dot" style="background:${c};"></span>${lab}<span class="lg-v">${v}</span></li>`).join('')}</ul>
  </div>`;
}
const fleetHtml = `
  <div class="fleet">
    <div class="fcard"><div class="panel-head"><h3>Veículos por status</h3></div>${donut([['ok', 'Disponível', 12, 'hsl(152 55% 38%)'], ['trip', 'Em viagem', 8, 'hsl(38 92% 48%)'], ['maint', 'Manutenção', 3, 'hsl(350 70% 52%)'], ['off', 'Inativo', 2, 'hsl(220 14% 46%)']], 'veículos')}</div>
    <div class="fcard"><div class="panel-head"><h3>Motoristas por status</h3></div>${donut([['ok', 'Disponível', 10, 'hsl(152 55% 38%)'], ['trip', 'Em viagem', 8, 'hsl(38 92% 48%)'], ['rest', 'Folga', 4, 'hsl(200 75% 42%)'], ['off', 'Inativo', 1, 'hsl(220 14% 46%)']], 'motoristas')}</div>
  </div>`;
const content = `
  <div class="page">
    <div class="page-head">
      <div class="ph-icon">${ico('chart', 'ic6')}</div>
      <div>
        <p class="breadcrumb">Painel <span>›</span> Operacional</p>
        <h1 class="ph-title">Bom dia, Fábio!</h1>
        <p class="ph-desc">Resumo operacional: cotações, embarques, programação de cargas e viagens por estado.</p>
      </div>
    </div>
    <div class="dash-card">
      ${panelsHtml}
      <div class="dash-2col">
        <div class="ts-card">
          <div class="panel-head"><h3>Volume logístico (12 semanas)</h3></div>
          <div class="ts-body">${areaChart()}</div>
        </div>
        ${fleetHtml}
      </div>
    </div>
  </div>`;
document.getElementById('app').innerHTML = `<div class="shell">${sidebar}<div class="main">${topbar}<div class="scrollarea">${content}</div></div></div>`;

// Sistema footer: collapsible (collapsed by default)
const sysToggle = document.getElementById('sys-toggle');
if (sysToggle) sysToggle.addEventListener('click', () => {
  document.getElementById('sys-items').classList.toggle('open');
  sysToggle.classList.toggle('expanded');
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/03-dashboard/dashboard-app.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/04-directory/app-shell.js
try { (() => {
/* global window, document */
// HiperTMS shared app shell — window.AppShell.renderShell({ activeLabel, content }) + icons.

const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  docDup: '<rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h6"/>',
  map: '<path d="m9 5-6 2.4V20l6-2.4 6 2.4 6-2.4V5l-6 2.4z"/><path d="M9 5v12.6M15 7.4V20"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6 6 0 0 1 11.6 0"/>',
  store: '<path d="M2 7l1.5-3h17L22 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M16 6l2 2M19 3l2 2"/>',
  bolt: '<path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  dots: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'
};
function ico(name, cls) {
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const QUICK = [['doc', 'Cotações'], ['truck', 'Embarques'], ['clipboard', 'Cargas'], ['map', 'Viagens'], ['doc', 'CT-e'], ['docDup', 'MDF-e']];
const HUBS = [['trending', 'Vendas'], ['truck', 'Operação'], ['building', 'Cadastros'], ['wrench', 'Frota'], ['cart', 'Compras'], ['wallet', 'Financeiro'], ['users', 'Equipes'], ['layers', 'Precificação']];
const SYSTEM = [['chart', 'Administração'], ['userCircle', 'Minha Conta'], ['store', 'Dados da Empresa'], ['users', 'Usuários'], ['card', 'Assinatura e Cobrança'], ['wrench', 'Configuração da operação'], ['key', 'Sequenciadores'], ['bolt', 'Automação']];
function navRow(icon, label, active) {
  return `<button class="navrow${active ? ' active' : ''}" type="button">
    <span class="navicon">${active ? '<span class="dot"></span>' : ''}${ico(icon, 'ic5')}</span>
    <span class="navlabel">${label}</span>
  </button>`;
}
function renderShell({
  activeLabel = '',
  content = ''
} = {}) {
  const sidebar = `
  <aside class="sidebar">
    <div class="sb-head"><span class="wm"><span class="h">Hiper</span><span class="t">TMS</span></span></div>
    <div class="sb-scroll">
      <p class="sb-grouplabel">Acesso rápido</p>
      ${QUICK.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
      <div class="sb-divider"></div>
      ${HUBS.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
    </div>
    <div class="sb-foot">
      <button class="navrow sys-toggle" type="button" id="sys-toggle">
        <span class="navicon">${ico('chart', 'ic5')}</span><span class="navlabel">Sistema</span><span class="navchev">${ico('chevD', 'ic4')}</span>
      </button>
      <div class="sys-items" id="sys-items">${SYSTEM.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}</div>
      <div class="sb-version">HiperTMS v12</div>
    </div>
  </aside>`;
  const topbar = `
  <header class="topbar">
    <div class="tb-left"><button class="tenant"><span class="tenant-logo">TM</span><span class="tenant-name">Transportadora Modelo LTDA</span>${ico('chevR', 'ic4 muted')}</button></div>
    <div class="tb-center">${ico('calendar', 'ic4 muted')}<span class="dt"><span>Segunda-feira</span><span class="sep">|</span><span class="nums">09/06/2026</span><span class="sep">·</span><span class="nums">14:30</span></span></div>
    <div class="tb-right">
      <button class="iconbtn">${ico('chat', 'ic5')}</button>
      <button class="iconbtn">${ico('bell', 'ic5')}<span class="reddot"></span></button>
      <button class="iconbtn">${ico('moon', 'ic5')}</button>
      <button class="avatar">FO</button>
    </div>
  </header>`;
  return `<div class="shell">${sidebar}<div class="main">${topbar}<div class="scrollarea">${content}</div></div></div>`;
}
function mountShell(rootId, opts) {
  document.getElementById(rootId).innerHTML = renderShell(opts);
  const st = document.getElementById('sys-toggle');
  if (st) st.addEventListener('click', () => {
    document.getElementById('sys-items').classList.toggle('open');
    st.classList.toggle('expanded');
  });
}
window.AppShell = {
  ICONS,
  ico,
  renderShell,
  mountShell
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/04-directory/app-shell.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/04-directory/directory-clients.js
try { (() => {
/* global window, document */
// Diretório · Clientes — list page content on the shared app shell.
// `ico` is provided globally by app-shell.js.

const CLIENTS = [{
  name: 'Transportes Aurora LTDA',
  doc: '12.345.678/0001-90',
  fase: 'Cliente ativo',
  macro: 'Conversão',
  loc: 'Curitiba/PR',
  tel: '(41) 99876-5432',
  email: 'compras@aurora.com.br',
  credito: 'R$ 120.000,00',
  status: ['success', 'Ativo'],
  at: '08/06/2026'
}, {
  name: 'Distribuidora Pampa S.A.',
  doc: '98.765.432/0001-10',
  fase: 'Negociação',
  macro: 'Oportunidade',
  loc: 'Porto Alegre/RS',
  tel: '(51) 3214-7788',
  email: 'logistica@pampa.com',
  credito: 'R$ 80.000,00',
  status: ['success', 'Ativo'],
  at: '07/06/2026'
}, {
  name: 'Indústria Vale Verde',
  doc: '45.678.901/0001-22',
  fase: 'Proposta enviada',
  macro: 'Oportunidade',
  loc: 'Belo Horizonte/MG',
  tel: '(31) 98123-4455',
  email: 'suprimentos@valeverde.ind.br',
  credito: 'R$ 200.000,00',
  status: ['warning', 'Pendente'],
  at: '06/06/2026'
}, {
  name: 'Comercial Litoral Norte',
  doc: '23.456.789/0001-33',
  fase: 'Cliente ativo',
  macro: 'Conversão',
  loc: 'Santos/SP',
  tel: '(13) 3344-2211',
  email: 'fretes@litoralnorte.com',
  credito: 'Não definido',
  status: ['success', 'Ativo'],
  at: '05/06/2026'
}, {
  name: 'AgroSul Cooperativa',
  doc: '34.567.890/0001-44',
  fase: 'Lead qualificado',
  macro: 'Prospecção',
  loc: 'Cascavel/PR',
  tel: '(45) 99988-1122',
  email: 'transporte@agrosul.coop.br',
  credito: 'R$ 50.000,00',
  status: ['secondary', 'Inativo'],
  at: '03/06/2026'
}, {
  name: 'Metalúrgica Horizonte',
  doc: '56.789.012/0001-55',
  fase: 'Em recuperação',
  macro: 'Retenção',
  loc: 'Joinville/SC',
  tel: '(47) 3030-9090',
  email: 'expedicao@horizonte.com.br',
  credito: 'R$ 35.000,00',
  status: ['error', 'Bloqueado'],
  at: '01/06/2026'
}, {
  name: 'Atacadão Primavera',
  doc: '67.890.123/0001-66',
  fase: 'Cliente ativo',
  macro: 'Conversão',
  loc: 'Goiânia/GO',
  tel: '(62) 99111-2233',
  email: 'compras@primavera.com',
  credito: 'R$ 95.000,00',
  status: ['success', 'Ativo'],
  at: '31/05/2026'
}];
function row(c) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar">${ico('building', 'ic5')}</span><div style="min-width:0"><div class="name">${c.name}</div><div class="doc">${c.doc}</div></div></div></td>
    <td><div style="display:flex;flex-direction:column;gap:2px"><span class="badge warning">${c.fase}</span><span class="cell-sub">${c.macro}</span></div></td>
    <td><span class="cell-locality">${ico('pin', 'ic4')}${c.loc}</span></td>
    <td><div class="cell-contact">${c.tel}<br>${c.email}</div></td>
    <td class="cell-num">${c.credito}</td>
    <td><span class="badge ${c.status[0]}">${c.status[1]}</span></td>
    <td class="cell-date">${c.at}</td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="Clientes">
  <div class="page-head">
    <div class="ph-icon">${ico('building', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Vendas <span>›</span> Clientes</p>
      <h1 class="ph-title">Clientes</h1>
      <p class="ph-desc">Tomadores de frete e clientes comerciais: fase, localidade, contato, limite de crédito e última atualização.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Nova Empresa</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por nome, fantasia ou documento..." /></div>
    <button class="btn btn-soft">Buscar</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros <span class="filter-count">2</span></button>
    <button class="btn btn-outline">${ico('download', 'ic4')} Exportar</button>
  </div>

  <p class="list-summary">Mostrando <strong>7</strong> de <strong>128</strong> empresas</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Empresa')}</th>
          <th>${sortable('Fase comercial')}</th>
          <th>${sortable('Localidade')}</th>
          <th>Contato</th>
          <th>${sortable('Limite crédito')}</th>
          <th>${sortable('Status')}</th>
          <th>${sortable('Atualizado')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${CLIENTS.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option><option>100</option></select></div>
      <div class="pg-nav">
        <button class="pg-btn" disabled>‹</button>
        <button class="pg-btn active">1</button>
        <button class="pg-btn">2</button>
        <button class="pg-btn">3</button>
        <span class="pg-info">…</span>
        <button class="pg-btn">6</button>
        <button class="pg-btn">›</button>
      </div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Cadastros',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/04-directory/directory-clients.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/05-finance/app-shell.js
try { (() => {
/* global window, document */
// HiperTMS shared app shell — window.AppShell.renderShell({ activeLabel, content }) + icons.

const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  docDup: '<rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h6"/>',
  map: '<path d="m9 5-6 2.4V20l6-2.4 6 2.4 6-2.4V5l-6 2.4z"/><path d="M9 5v12.6M15 7.4V20"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6 6 0 0 1 11.6 0"/>',
  store: '<path d="M2 7l1.5-3h17L22 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M16 6l2 2M19 3l2 2"/>',
  bolt: '<path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  dots: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'
};
function ico(name, cls) {
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const QUICK = [['doc', 'Cotações'], ['truck', 'Embarques'], ['clipboard', 'Cargas'], ['map', 'Viagens'], ['doc', 'CT-e'], ['docDup', 'MDF-e']];
const HUBS = [['trending', 'Vendas'], ['truck', 'Operação'], ['building', 'Cadastros'], ['wrench', 'Frota'], ['cart', 'Compras'], ['wallet', 'Financeiro'], ['users', 'Equipes'], ['layers', 'Precificação']];
const SYSTEM = [['chart', 'Administração'], ['userCircle', 'Minha Conta'], ['store', 'Dados da Empresa'], ['users', 'Usuários'], ['card', 'Assinatura e Cobrança'], ['wrench', 'Configuração da operação'], ['key', 'Sequenciadores'], ['bolt', 'Automação']];
function navRow(icon, label, active) {
  return `<button class="navrow${active ? ' active' : ''}" type="button">
    <span class="navicon">${active ? '<span class="dot"></span>' : ''}${ico(icon, 'ic5')}</span>
    <span class="navlabel">${label}</span>
  </button>`;
}
function renderShell({
  activeLabel = '',
  content = ''
} = {}) {
  const sidebar = `
  <aside class="sidebar">
    <div class="sb-head"><span class="wm"><span class="h">Hiper</span><span class="t">TMS</span></span></div>
    <div class="sb-scroll">
      <p class="sb-grouplabel">Acesso rápido</p>
      ${QUICK.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
      <div class="sb-divider"></div>
      ${HUBS.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
    </div>
    <div class="sb-foot">
      <button class="navrow sys-toggle" type="button" id="sys-toggle">
        <span class="navicon">${ico('chart', 'ic5')}</span><span class="navlabel">Sistema</span><span class="navchev">${ico('chevD', 'ic4')}</span>
      </button>
      <div class="sys-items" id="sys-items">${SYSTEM.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}</div>
      <div class="sb-version">HiperTMS v12</div>
    </div>
  </aside>`;
  const topbar = `
  <header class="topbar">
    <div class="tb-left"><button class="tenant"><span class="tenant-logo">TM</span><span class="tenant-name">Transportadora Modelo LTDA</span>${ico('chevR', 'ic4 muted')}</button></div>
    <div class="tb-center">${ico('calendar', 'ic4 muted')}<span class="dt"><span>Segunda-feira</span><span class="sep">|</span><span class="nums">09/06/2026</span><span class="sep">·</span><span class="nums">14:30</span></span></div>
    <div class="tb-right">
      <button class="iconbtn">${ico('chat', 'ic5')}</button>
      <button class="iconbtn">${ico('bell', 'ic5')}<span class="reddot"></span></button>
      <button class="iconbtn">${ico('moon', 'ic5')}</button>
      <button class="avatar">FO</button>
    </div>
  </header>`;
  return `<div class="shell">${sidebar}<div class="main">${topbar}<div class="scrollarea">${content}</div></div></div>`;
}
function mountShell(rootId, opts) {
  document.getElementById(rootId).innerHTML = renderShell(opts);
  const st = document.getElementById('sys-toggle');
  if (st) st.addEventListener('click', () => {
    document.getElementById('sys-items').classList.toggle('open');
    st.classList.toggle('expanded');
  });
}
window.AppShell = {
  ICONS,
  ico,
  renderShell,
  mountShell
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/05-finance/app-shell.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/05-finance/finance-account-form.js
try { (() => {
/* global window */
// Financeiro · Nova conta a pagar — form-page pattern on the shared shell. `ico` is global.

const content = `
<div class="page form-wrap" data-screen-label="Nova conta a pagar">
  <div class="page-head">
    <div class="ph-icon">${ico('wallet', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Financeiro <span>›</span> Contas a Pagar <span>›</span> Nova</p>
      <h1 class="ph-title">Nova conta a pagar</h1>
      <p class="ph-desc">Registre uma obrigação: valor, vencimento, categoria e forma de pagamento. Lançamentos da operação alimentam o caixa automaticamente.</p>
    </div>
    <div class="seg"><button class="active">Conta única</button><button>Parcelada</button></div>
  </div>

  <div class="form-card">
    <div class="form-section-head"><h3>Dados da conta</h3><p>Identificação e classificação da despesa.</p></div>
    <div class="form-body">
      <div class="form-grid">
        <div class="field col-2"><label>Descrição <span class="req">*</span></label><input type="text" placeholder="Ex.: Abastecimento frota — junho" /></div>
        <div class="field"><label>Categoria <span class="req">*</span></label><select><option>Combustível</option><option>Manutenção</option><option>Salários e encargos</option><option>Impostos e taxas</option><option>Fornecedores</option><option>Pedágio</option><option>Outros</option></select></div>
        <div class="field"><label>Fornecedor</label><select><option>Posto Rede Sul LTDA</option><option>Oficina Central Diesel</option><option>Pneus &amp; Cia</option><option>— Sem fornecedor —</option></select></div>
        <div class="field"><label>Valor <span class="req">*</span></label><div class="prefix-wrap"><span class="prefix">R$</span><input type="text" inputmode="decimal" placeholder="0,00" value="4.250,00" /></div></div>
        <div class="field"><label>Vencimento <span class="req">*</span></label><input type="text" placeholder="dd/mm/aaaa" value="20/06/2026" /></div>
        <div class="field"><label>Competência</label><input type="text" placeholder="dd/mm/aaaa" value="09/06/2026" /></div>
        <div class="field"><label>Centro de custo</label><select><option>Operação — Frota</option><option>Administrativo</option><option>Comercial</option></select></div>
      </div>
    </div>
  </div>

  <div class="form-card">
    <div class="form-section-head"><h3>Pagamento</h3><p>Conta, forma e status do pagamento.</p></div>
    <div class="form-body">
      <div class="form-grid">
        <div class="field"><label>Conta bancária</label><select><option>Banco do Brasil — Ag 1234 / CC 56789-0</option><option>Itaú — Ag 4321 / CC 09876-5</option><option>Caixa Operacional</option></select></div>
        <div class="field"><label>Forma de pagamento</label><select><option>Boleto</option><option>PIX</option><option>Transferência (TED)</option><option>Cartão</option></select></div>
        <div class="field"><label>Status</label><select><option>Em aberto</option><option>Pago</option><option>Agendado</option><option>Vencido</option></select></div>
        <div class="field"><label>Documento / NF</label><input type="text" placeholder="Nº do documento" /></div>
      </div>
    </div>
  </div>

  <div class="form-card">
    <div class="form-section-head"><h3>Complemento</h3><p>Observações e anexos (opcional).</p></div>
    <div class="form-body">
      <div class="form-grid">
        <div class="field col-2"><label>Observações</label><textarea placeholder="Notas internas sobre esta conta…"></textarea></div>
        <div class="field col-2"><label>Anexos</label><div class="dropzone">${ico('download', 'ic6')}Arraste comprovantes/boletos aqui ou clique para enviar<br><span class="hint">PDF, JPG ou PNG até 10 MB</span></div></div>
      </div>
    </div>
  </div>

  <div class="form-actions">
    <button class="btn btn-outline">Cancelar</button>
    <button class="btn btn-soft">Salvar e novo</button>
    <button class="btn btn-primary">Salvar conta</button>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Financeiro',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/05-finance/finance-account-form.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/06-fiscal/app-shell.js
try { (() => {
/* global window, document */
// HiperTMS shared app shell — window.AppShell.renderShell({ activeLabel, content }) + icons.

const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  docDup: '<rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h6"/>',
  map: '<path d="m9 5-6 2.4V20l6-2.4 6 2.4 6-2.4V5l-6 2.4z"/><path d="M9 5v12.6M15 7.4V20"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6 6 0 0 1 11.6 0"/>',
  store: '<path d="M2 7l1.5-3h17L22 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M16 6l2 2M19 3l2 2"/>',
  bolt: '<path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  dots: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'
};
function ico(name, cls) {
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const QUICK = [['doc', 'Cotações'], ['truck', 'Embarques'], ['clipboard', 'Cargas'], ['map', 'Viagens'], ['doc', 'CT-e'], ['docDup', 'MDF-e']];
const HUBS = [['trending', 'Vendas'], ['truck', 'Operação'], ['building', 'Cadastros'], ['wrench', 'Frota'], ['cart', 'Compras'], ['wallet', 'Financeiro'], ['users', 'Equipes'], ['layers', 'Precificação']];
const SYSTEM = [['chart', 'Administração'], ['userCircle', 'Minha Conta'], ['store', 'Dados da Empresa'], ['users', 'Usuários'], ['card', 'Assinatura e Cobrança'], ['wrench', 'Configuração da operação'], ['key', 'Sequenciadores'], ['bolt', 'Automação']];
function navRow(icon, label, active) {
  return `<button class="navrow${active ? ' active' : ''}" type="button">
    <span class="navicon">${active ? '<span class="dot"></span>' : ''}${ico(icon, 'ic5')}</span>
    <span class="navlabel">${label}</span>
  </button>`;
}
function renderShell({
  activeLabel = '',
  content = ''
} = {}) {
  const sidebar = `
  <aside class="sidebar">
    <div class="sb-head"><span class="wm"><span class="h">Hiper</span><span class="t">TMS</span></span></div>
    <div class="sb-scroll">
      <p class="sb-grouplabel">Acesso rápido</p>
      ${QUICK.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
      <div class="sb-divider"></div>
      ${HUBS.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
    </div>
    <div class="sb-foot">
      <button class="navrow sys-toggle" type="button" id="sys-toggle">
        <span class="navicon">${ico('chart', 'ic5')}</span><span class="navlabel">Sistema</span><span class="navchev">${ico('chevD', 'ic4')}</span>
      </button>
      <div class="sys-items" id="sys-items">${SYSTEM.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}</div>
      <div class="sb-version">HiperTMS v12</div>
    </div>
  </aside>`;
  const topbar = `
  <header class="topbar">
    <div class="tb-left"><button class="tenant"><span class="tenant-logo">TM</span><span class="tenant-name">Transportadora Modelo LTDA</span>${ico('chevR', 'ic4 muted')}</button></div>
    <div class="tb-center">${ico('calendar', 'ic4 muted')}<span class="dt"><span>Segunda-feira</span><span class="sep">|</span><span class="nums">09/06/2026</span><span class="sep">·</span><span class="nums">14:30</span></span></div>
    <div class="tb-right">
      <button class="iconbtn">${ico('chat', 'ic5')}</button>
      <button class="iconbtn">${ico('bell', 'ic5')}<span class="reddot"></span></button>
      <button class="iconbtn">${ico('moon', 'ic5')}</button>
      <button class="avatar">FO</button>
    </div>
  </header>`;
  return `<div class="shell">${sidebar}<div class="main">${topbar}<div class="scrollarea">${content}</div></div></div>`;
}
function mountShell(rootId, opts) {
  document.getElementById(rootId).innerHTML = renderShell(opts);
  const st = document.getElementById('sys-toggle');
  if (st) st.addEventListener('click', () => {
    document.getElementById('sys-items').classList.toggle('open');
    st.classList.toggle('expanded');
  });
}
window.AppShell = {
  ICONS,
  ico,
  renderShell,
  mountShell
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/06-fiscal/app-shell.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/06-fiscal/fiscal-cte-list.js
try { (() => {
/* global window */
// Fiscal · CT-e — list page on the shared shell. `ico` is global (app-shell.js).

const CTES = [{
  num: '000.1284',
  serie: '1',
  chave: '3526 0612 3456 …8901',
  rem: 'Transportes Aurora LTDA',
  dest: 'Indústria Vale Verde',
  emb: 'EMB-2026-0461',
  valor: 'R$ 4.863,64',
  emiss: '09/06/2026',
  st: ['success', 'Autorizado']
}, {
  num: '000.1283',
  serie: '1',
  chave: '3526 0612 3456 …8842',
  rem: 'Distribuidora Pampa S.A.',
  dest: 'Atacadão Primavera',
  emb: 'EMB-2026-0460',
  valor: 'R$ 7.210,00',
  emiss: '09/06/2026',
  st: ['warning', 'Processando']
}, {
  num: '000.1282',
  serie: '1',
  chave: '3526 0612 3456 …8773',
  rem: 'AgroSul Cooperativa',
  dest: 'Comercial Litoral Norte',
  emb: 'EMB-2026-0458',
  valor: 'R$ 2.940,50',
  emiss: '08/06/2026',
  st: ['error', 'Rejeitado']
}, {
  num: '000.1281',
  serie: '1',
  chave: '3526 0612 3456 …8714',
  rem: 'Metalúrgica Horizonte',
  dest: 'Transportes Aurora LTDA',
  emb: 'EMB-2026-0455',
  valor: 'R$ 5.120,00',
  emiss: '08/06/2026',
  st: ['success', 'Autorizado']
}, {
  num: '000.1280',
  serie: '1',
  chave: '3526 0612 3456 …8655',
  rem: 'Indústria Vale Verde',
  dest: 'Distribuidora Pampa S.A.',
  emb: 'EMB-2026-0451',
  valor: 'R$ 9.880,30',
  emiss: '07/06/2026',
  st: ['secondary', 'Cancelado']
}, {
  num: '000.1279',
  serie: '1',
  chave: '3526 0612 3456 …8596',
  rem: 'Atacadão Primavera',
  dest: 'AgroSul Cooperativa',
  emb: 'EMB-2026-0449',
  valor: 'R$ 3.450,00',
  emiss: '07/06/2026',
  st: ['error', 'Denegado']
}];
function row(c) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar">${ico('doc', 'ic5')}</span><div style="min-width:0"><div class="name">CT-e ${c.num} · Série ${c.serie}</div><div class="doc">${c.chave}</div></div></div></td>
    <td><div class="cell-contact"><strong style="color:var(--fg);font-weight:600">${c.rem}</strong><br>→ ${c.dest}</div></td>
    <td><span class="cell-num">${c.emb}</span></td>
    <td class="cell-num">${c.valor}</td>
    <td class="cell-date">${c.emiss}</td>
    <td><span class="badge ${c.st[0]}">${c.st[1]}</span></td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="CT-e">
  <div class="page-head">
    <div class="ph-icon">${ico('doc', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Operação <span>›</span> CT-e</p>
      <h1 class="ph-title">CT-e</h1>
      <p class="ph-desc">Conhecimentos de transporte eletrônicos: emissão, status na SEFAZ, carta de correção e cancelamento.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Emitir CT-e</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por chave, número ou tomador..." /></div>
    <button class="btn btn-soft">Mês atual</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros <span class="filter-count">1</span></button>
    <button class="btn btn-outline">${ico('download', 'ic4')} Exportar</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> de <strong>342</strong> documentos · período <strong>jun/2026</strong></p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Documento')}</th>
          <th>Remetente / Destinatário</th>
          <th>Embarque</th>
          <th>${sortable('Valor')}</th>
          <th>${sortable('Emissão')}</th>
          <th>${sortable('Status')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${CTES.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>20</option><option>50</option><option>100</option></select></div>
      <div class="pg-nav">
        <button class="pg-btn" disabled>‹</button>
        <button class="pg-btn active">1</button>
        <button class="pg-btn">2</button>
        <button class="pg-btn">3</button>
        <span class="pg-info">…</span>
        <button class="pg-btn">18</button>
        <button class="pg-btn">›</button>
      </div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'CT-e',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/06-fiscal/fiscal-cte-list.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/07-fleet/app-shell.js
try { (() => {
/* global window, document */
// HiperTMS shared app shell — window.AppShell.renderShell({ activeLabel, content }) + icons.

const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  docDup: '<rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h6"/>',
  map: '<path d="m9 5-6 2.4V20l6-2.4 6 2.4 6-2.4V5l-6 2.4z"/><path d="M9 5v12.6M15 7.4V20"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6 6 0 0 1 11.6 0"/>',
  store: '<path d="M2 7l1.5-3h17L22 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M16 6l2 2M19 3l2 2"/>',
  bolt: '<path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  dots: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'
};
function ico(name, cls) {
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const QUICK = [['doc', 'Cotações'], ['truck', 'Embarques'], ['clipboard', 'Cargas'], ['map', 'Viagens'], ['doc', 'CT-e'], ['docDup', 'MDF-e']];
const HUBS = [['trending', 'Vendas'], ['truck', 'Operação'], ['building', 'Cadastros'], ['wrench', 'Frota'], ['cart', 'Compras'], ['wallet', 'Financeiro'], ['users', 'Equipes'], ['layers', 'Precificação']];
const SYSTEM = [['chart', 'Administração'], ['userCircle', 'Minha Conta'], ['store', 'Dados da Empresa'], ['users', 'Usuários'], ['card', 'Assinatura e Cobrança'], ['wrench', 'Configuração da operação'], ['key', 'Sequenciadores'], ['bolt', 'Automação']];
function navRow(icon, label, active) {
  return `<button class="navrow${active ? ' active' : ''}" type="button">
    <span class="navicon">${active ? '<span class="dot"></span>' : ''}${ico(icon, 'ic5')}</span>
    <span class="navlabel">${label}</span>
  </button>`;
}
function renderShell({
  activeLabel = '',
  content = ''
} = {}) {
  const sidebar = `
  <aside class="sidebar">
    <div class="sb-head"><span class="wm"><span class="h">Hiper</span><span class="t">TMS</span></span></div>
    <div class="sb-scroll">
      <p class="sb-grouplabel">Acesso rápido</p>
      ${QUICK.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
      <div class="sb-divider"></div>
      ${HUBS.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
    </div>
    <div class="sb-foot">
      <button class="navrow sys-toggle" type="button" id="sys-toggle">
        <span class="navicon">${ico('chart', 'ic5')}</span><span class="navlabel">Sistema</span><span class="navchev">${ico('chevD', 'ic4')}</span>
      </button>
      <div class="sys-items" id="sys-items">${SYSTEM.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}</div>
      <div class="sb-version">HiperTMS v12</div>
    </div>
  </aside>`;
  const topbar = `
  <header class="topbar">
    <div class="tb-left"><button class="tenant"><span class="tenant-logo">TM</span><span class="tenant-name">Transportadora Modelo LTDA</span>${ico('chevR', 'ic4 muted')}</button></div>
    <div class="tb-center">${ico('calendar', 'ic4 muted')}<span class="dt"><span>Segunda-feira</span><span class="sep">|</span><span class="nums">09/06/2026</span><span class="sep">·</span><span class="nums">14:30</span></span></div>
    <div class="tb-right">
      <button class="iconbtn">${ico('chat', 'ic5')}</button>
      <button class="iconbtn">${ico('bell', 'ic5')}<span class="reddot"></span></button>
      <button class="iconbtn">${ico('moon', 'ic5')}</button>
      <button class="avatar">FO</button>
    </div>
  </header>`;
  return `<div class="shell">${sidebar}<div class="main">${topbar}<div class="scrollarea">${content}</div></div></div>`;
}
function mountShell(rootId, opts) {
  document.getElementById(rootId).innerHTML = renderShell(opts);
  const st = document.getElementById('sys-toggle');
  if (st) st.addEventListener('click', () => {
    document.getElementById('sys-items').classList.toggle('open');
    st.classList.toggle('expanded');
  });
}
window.AppShell = {
  ICONS,
  ico,
  renderShell,
  mountShell
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/07-fleet/app-shell.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/07-fleet/fleet-vehicles-list.js
try { (() => {
/* global window */
// Frota · Veículos — list page on the shared shell. `ico` is global.

const VEHICLES = [{
  placa: 'ABC1D23',
  modelo: 'Scania R450',
  tipo: 'Cavalo mecânico',
  km: '412.350 km',
  manut: '09/2026',
  docs: ['success', 'Em dia'],
  st: ['warning', 'Em viagem']
}, {
  placa: 'DEF4G56',
  modelo: 'Volvo FH 540',
  tipo: 'Cavalo mecânico',
  km: '287.100 km',
  manut: '07/2026',
  docs: ['success', 'Em dia'],
  st: ['success', 'Disponível']
}, {
  placa: 'GHI7J89',
  modelo: 'Randon SR',
  tipo: 'Carreta (semirreboque)',
  km: '198.420 km',
  manut: '11/2026',
  docs: ['success', 'Em dia'],
  st: ['success', 'Disponível']
}, {
  placa: 'JKL0M12',
  modelo: 'VW Constellation 24.280',
  tipo: 'Truck',
  km: '356.880 km',
  manut: 'Em andamento',
  docs: ['warning', 'Vence em 12d'],
  st: ['error', 'Manutenção']
}, {
  placa: 'MNO3P45',
  modelo: 'Mercedes Accelo 1016',
  tipo: 'VUC',
  km: '141.260 km',
  manut: '08/2026',
  docs: ['warning', 'Vence em 12d'],
  st: ['success', 'Disponível']
}, {
  placa: 'PQR6S78',
  modelo: 'Librelato LS',
  tipo: 'Carreta (semirreboque)',
  km: '233.910 km',
  manut: '—',
  docs: ['error', 'Vencido'],
  st: ['secondary', 'Inativo']
}];
function row(v) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar" style="background:#fef3c7;color:#92400e">${ico('truck', 'ic5')}</span><div style="min-width:0"><div class="name" style="font-variant-numeric:tabular-nums">${v.placa}</div><div class="doc" style="font-family:inherit">${v.modelo}</div></div></div></td>
    <td><span class="cell-num" style="color:var(--fg-muted)">${v.tipo}</span></td>
    <td><span class="badge ${v.st[0]}">${v.st[1]}</span></td>
    <td class="cell-num">${v.km}</td>
    <td class="cell-date">${v.manut}</td>
    <td><span class="badge ${v.docs[0]}">${v.docs[1]}</span></td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="Veículos">
  <div class="page-head">
    <div class="ph-icon">${ico('truck', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Frota <span>›</span> Veículos</p>
      <h1 class="ph-title">Veículos</h1>
      <p class="ph-desc">Frota própria e agregada: placa, tipo, status operacional, odômetro e situação documental (licenciamento, manutenção).</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Novo veículo</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por placa, modelo ou tipo..." /></div>
    <button class="btn btn-soft">Buscar</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros</button>
    <button class="btn btn-outline">${ico('download', 'ic4')} Exportar</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> de <strong>34</strong> veículos</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Veículo')}</th>
          <th>Tipo</th>
          <th>${sortable('Status')}</th>
          <th>${sortable('Odômetro')}</th>
          <th>Próx. manutenção</th>
          <th>Documentos</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${VEHICLES.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option></select></div>
      <div class="pg-nav">
        <button class="pg-btn" disabled>‹</button>
        <button class="pg-btn active">1</button>
        <button class="pg-btn">2</button>
        <button class="pg-btn">›</button>
      </div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Frota',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/07-fleet/fleet-vehicles-list.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/08-logistics/app-shell.js
try { (() => {
/* global window, document */
// HiperTMS shared app shell — window.AppShell.renderShell({ activeLabel, content }) + icons.

const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  docDup: '<rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h6"/>',
  map: '<path d="m9 5-6 2.4V20l6-2.4 6 2.4 6-2.4V5l-6 2.4z"/><path d="M9 5v12.6M15 7.4V20"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6 6 0 0 1 11.6 0"/>',
  store: '<path d="M2 7l1.5-3h17L22 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M16 6l2 2M19 3l2 2"/>',
  bolt: '<path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  dots: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'
};
function ico(name, cls) {
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const QUICK = [['doc', 'Cotações'], ['truck', 'Embarques'], ['clipboard', 'Cargas'], ['map', 'Viagens'], ['doc', 'CT-e'], ['docDup', 'MDF-e']];
const HUBS = [['trending', 'Vendas'], ['truck', 'Operação'], ['building', 'Cadastros'], ['wrench', 'Frota'], ['cart', 'Compras'], ['wallet', 'Financeiro'], ['users', 'Equipes'], ['layers', 'Precificação']];
const SYSTEM = [['chart', 'Administração'], ['userCircle', 'Minha Conta'], ['store', 'Dados da Empresa'], ['users', 'Usuários'], ['card', 'Assinatura e Cobrança'], ['wrench', 'Configuração da operação'], ['key', 'Sequenciadores'], ['bolt', 'Automação']];
function navRow(icon, label, active) {
  return `<button class="navrow${active ? ' active' : ''}" type="button">
    <span class="navicon">${active ? '<span class="dot"></span>' : ''}${ico(icon, 'ic5')}</span>
    <span class="navlabel">${label}</span>
  </button>`;
}
function renderShell({
  activeLabel = '',
  content = ''
} = {}) {
  const sidebar = `
  <aside class="sidebar">
    <div class="sb-head"><span class="wm"><span class="h">Hiper</span><span class="t">TMS</span></span></div>
    <div class="sb-scroll">
      <p class="sb-grouplabel">Acesso rápido</p>
      ${QUICK.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
      <div class="sb-divider"></div>
      ${HUBS.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
    </div>
    <div class="sb-foot">
      <button class="navrow sys-toggle" type="button" id="sys-toggle">
        <span class="navicon">${ico('chart', 'ic5')}</span><span class="navlabel">Sistema</span><span class="navchev">${ico('chevD', 'ic4')}</span>
      </button>
      <div class="sys-items" id="sys-items">${SYSTEM.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}</div>
      <div class="sb-version">HiperTMS v12</div>
    </div>
  </aside>`;
  const topbar = `
  <header class="topbar">
    <div class="tb-left"><button class="tenant"><span class="tenant-logo">TM</span><span class="tenant-name">Transportadora Modelo LTDA</span>${ico('chevR', 'ic4 muted')}</button></div>
    <div class="tb-center">${ico('calendar', 'ic4 muted')}<span class="dt"><span>Segunda-feira</span><span class="sep">|</span><span class="nums">09/06/2026</span><span class="sep">·</span><span class="nums">14:30</span></span></div>
    <div class="tb-right">
      <button class="iconbtn">${ico('chat', 'ic5')}</button>
      <button class="iconbtn">${ico('bell', 'ic5')}<span class="reddot"></span></button>
      <button class="iconbtn">${ico('moon', 'ic5')}</button>
      <button class="avatar">FO</button>
    </div>
  </header>`;
  return `<div class="shell">${sidebar}<div class="main">${topbar}<div class="scrollarea">${content}</div></div></div>`;
}
function mountShell(rootId, opts) {
  document.getElementById(rootId).innerHTML = renderShell(opts);
  const st = document.getElementById('sys-toggle');
  if (st) st.addEventListener('click', () => {
    document.getElementById('sys-items').classList.toggle('open');
    st.classList.toggle('expanded');
  });
}
window.AppShell = {
  ICONS,
  ico,
  renderShell,
  mountShell
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/08-logistics/app-shell.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/08-logistics/logistics-quotes-list.js
try { (() => {
/* global window */
// Logística · Cotações — list page on the shared shell. `ico` is global.

const QUOTES = [{
  num: 'COT-2026-0461',
  cli: 'Indústria Vale Verde',
  rota: 'São Paulo/SP → Curitiba/PR',
  mod: 'LCL',
  valor: 'R$ 4.863,64',
  margem: '30,7%',
  mcls: 'success',
  st: ['success', 'Convertida'],
  val: '12/06/2026'
}, {
  num: 'COT-2026-0460',
  cli: 'Atacadão Primavera',
  rota: 'Goiânia/GO → Brasília/DF',
  mod: 'FCL',
  valor: 'R$ 7.210,00',
  margem: '24,1%',
  mcls: 'warning',
  st: ['warning', 'Aberta'],
  val: '15/06/2026'
}, {
  num: 'COT-2026-0459',
  cli: 'AgroSul Cooperativa',
  rota: 'Cascavel/PR → Paranaguá/PR',
  mod: 'FCL',
  valor: 'R$ 5.120,00',
  margem: '28,4%',
  mcls: 'success',
  st: ['info', 'Aprovada'],
  val: '14/06/2026'
}, {
  num: 'COT-2026-0458',
  cli: 'Comercial Litoral Norte',
  rota: 'Santos/SP → Campinas/SP',
  mod: 'LCL',
  valor: 'R$ 1.980,00',
  margem: '8,2%',
  mcls: 'error',
  st: ['secondary', 'Rascunho'],
  val: '—'
}, {
  num: 'COT-2026-0457',
  cli: 'Metalúrgica Horizonte',
  rota: 'Joinville/SC → Itajaí/SC',
  mod: 'FCL',
  valor: 'R$ 3.450,00',
  margem: '19,0%',
  mcls: 'warning',
  st: ['error', 'Rejeitada'],
  val: '10/06/2026'
}, {
  num: 'COT-2026-0456',
  cli: 'Distribuidora Pampa S.A.',
  rota: 'Porto Alegre/RS → Caxias do Sul/RS',
  mod: 'LCL',
  valor: 'R$ 2.310,00',
  margem: '22,5%',
  mcls: 'warning',
  st: ['secondary', 'Expirada'],
  val: '05/06/2026'
}];
function row(q) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar">${ico('doc', 'ic5')}</span><div style="min-width:0"><div class="name" style="font-family:'JetBrains Mono',monospace;font-size:13px">${q.num}</div><div class="doc" style="font-family:inherit">${q.cli}</div></div></div></td>
    <td><span class="cell-locality">${ico('pin', 'ic4')}${q.rota}</span></td>
    <td><span class="badge secondary">${q.mod}</span></td>
    <td class="cell-num">${q.valor}</td>
    <td><span class="badge ${q.mcls}">${q.margem}</span></td>
    <td><span class="badge ${q.st[0]}">${q.st[1]}</span></td>
    <td class="cell-date">${q.val}</td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="Cotações">
  <div class="page-head">
    <div class="ph-icon">${ico('doc', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Vendas <span>›</span> Cotações</p>
      <h1 class="ph-title">Cotações</h1>
      <p class="ph-desc">Propostas de frete com imposto, custo e margem item a item. Acompanhe status e converta em embarque.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Nova cotação</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por número, cliente ou rota..." /></div>
    <button class="btn btn-soft">Buscar</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros</button>
    <button class="btn btn-outline">${ico('download', 'ic4')} Exportar</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> de <strong>87</strong> cotações</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Cotação')}</th>
          <th>Rota</th>
          <th>Modal.</th>
          <th>${sortable('Valor')}</th>
          <th>${sortable('Margem')}</th>
          <th>${sortable('Status')}</th>
          <th>${sortable('Validade')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${QUOTES.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option></select></div>
      <div class="pg-nav"><button class="pg-btn" disabled>‹</button><button class="pg-btn active">1</button><button class="pg-btn">2</button><button class="pg-btn">3</button><button class="pg-btn">4</button><button class="pg-btn">›</button></div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Cotações',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/08-logistics/logistics-quotes-list.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/09-pricing/app-shell.js
try { (() => {
/* global window, document */
// HiperTMS shared app shell — window.AppShell.renderShell({ activeLabel, content }) + icons.

const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  docDup: '<rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h6"/>',
  map: '<path d="m9 5-6 2.4V20l6-2.4 6 2.4 6-2.4V5l-6 2.4z"/><path d="M9 5v12.6M15 7.4V20"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6 6 0 0 1 11.6 0"/>',
  store: '<path d="M2 7l1.5-3h17L22 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M16 6l2 2M19 3l2 2"/>',
  bolt: '<path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  dots: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'
};
function ico(name, cls) {
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const QUICK = [['doc', 'Cotações'], ['truck', 'Embarques'], ['clipboard', 'Cargas'], ['map', 'Viagens'], ['doc', 'CT-e'], ['docDup', 'MDF-e']];
const HUBS = [['trending', 'Vendas'], ['truck', 'Operação'], ['building', 'Cadastros'], ['wrench', 'Frota'], ['cart', 'Compras'], ['wallet', 'Financeiro'], ['users', 'Equipes'], ['layers', 'Precificação']];
const SYSTEM = [['chart', 'Administração'], ['userCircle', 'Minha Conta'], ['store', 'Dados da Empresa'], ['users', 'Usuários'], ['card', 'Assinatura e Cobrança'], ['wrench', 'Configuração da operação'], ['key', 'Sequenciadores'], ['bolt', 'Automação']];
function navRow(icon, label, active) {
  return `<button class="navrow${active ? ' active' : ''}" type="button">
    <span class="navicon">${active ? '<span class="dot"></span>' : ''}${ico(icon, 'ic5')}</span>
    <span class="navlabel">${label}</span>
  </button>`;
}
function renderShell({
  activeLabel = '',
  content = ''
} = {}) {
  const sidebar = `
  <aside class="sidebar">
    <div class="sb-head"><span class="wm"><span class="h">Hiper</span><span class="t">TMS</span></span></div>
    <div class="sb-scroll">
      <p class="sb-grouplabel">Acesso rápido</p>
      ${QUICK.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
      <div class="sb-divider"></div>
      ${HUBS.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
    </div>
    <div class="sb-foot">
      <button class="navrow sys-toggle" type="button" id="sys-toggle">
        <span class="navicon">${ico('chart', 'ic5')}</span><span class="navlabel">Sistema</span><span class="navchev">${ico('chevD', 'ic4')}</span>
      </button>
      <div class="sys-items" id="sys-items">${SYSTEM.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}</div>
      <div class="sb-version">HiperTMS v12</div>
    </div>
  </aside>`;
  const topbar = `
  <header class="topbar">
    <div class="tb-left"><button class="tenant"><span class="tenant-logo">TM</span><span class="tenant-name">Transportadora Modelo LTDA</span>${ico('chevR', 'ic4 muted')}</button></div>
    <div class="tb-center">${ico('calendar', 'ic4 muted')}<span class="dt"><span>Segunda-feira</span><span class="sep">|</span><span class="nums">09/06/2026</span><span class="sep">·</span><span class="nums">14:30</span></span></div>
    <div class="tb-right">
      <button class="iconbtn">${ico('chat', 'ic5')}</button>
      <button class="iconbtn">${ico('bell', 'ic5')}<span class="reddot"></span></button>
      <button class="iconbtn">${ico('moon', 'ic5')}</button>
      <button class="avatar">FO</button>
    </div>
  </header>`;
  return `<div class="shell">${sidebar}<div class="main">${topbar}<div class="scrollarea">${content}</div></div></div>`;
}
function mountShell(rootId, opts) {
  document.getElementById(rootId).innerHTML = renderShell(opts);
  const st = document.getElementById('sys-toggle');
  if (st) st.addEventListener('click', () => {
    document.getElementById('sys-items').classList.toggle('open');
    st.classList.toggle('expanded');
  });
}
window.AppShell = {
  ICONS,
  ico,
  renderShell,
  mountShell
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/09-pricing/app-shell.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/09-pricing/pricing-tables-list.js
try { (() => {
/* global window */
// Precificação · Tabelas de Preço — list page on the shared shell. `ico` is global.

const TABLES = [{
  nome: 'Tabela Nacional Modelo',
  regime: 'Lucro Presumido',
  abrang: 'Nacional · todas as rotas',
  margem: '28%',
  vig: '01/01/2026 – 31/12/2026',
  st: ['success', 'Vigente']
}, {
  nome: 'Sudeste — Carga Geral',
  regime: 'Simples Nacional',
  abrang: 'SP, RJ, MG, ES',
  margem: '24%',
  vig: '01/03/2026 – 28/02/2027',
  st: ['success', 'Vigente']
}, {
  nome: 'Sul — Granel',
  regime: 'Lucro Real',
  abrang: 'PR, SC, RS',
  margem: '31%',
  vig: '01/06/2026 – 31/05/2027',
  st: ['success', 'Vigente']
}, {
  nome: 'Cliente: Indústria Vale Verde',
  regime: 'Lucro Presumido',
  abrang: 'Contrato dedicado',
  margem: '18%',
  vig: '15/06/2026 – 14/06/2027',
  st: ['warning', 'Aguardando aprovação']
}, {
  nome: 'Centro-Oeste — Agro',
  regime: 'Lucro Presumido',
  abrang: 'GO, MT, MS, DF',
  margem: '26%',
  vig: '01/02/2026 – 31/07/2026',
  st: ['info', 'Em revisão']
}, {
  nome: 'Tabela Nacional 2025',
  regime: 'Lucro Presumido',
  abrang: 'Nacional · todas as rotas',
  margem: '27%',
  vig: '01/01/2025 – 31/12/2025',
  st: ['secondary', 'Encerrada']
}];
function row(t) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar" style="background:#ede9fe;color:#6d28d9">${ico('layers', 'ic5')}</span><div style="min-width:0"><div class="name">${t.nome}</div><div class="doc" style="font-family:inherit">${t.abrang}</div></div></div></td>
    <td><span class="badge secondary">${t.regime}</span></td>
    <td><span class="badge success">${t.margem}</span></td>
    <td class="cell-date">${t.vig}</td>
    <td><span class="badge ${t.st[0]}">${t.st[1]}</span></td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="Tabelas de Preço">
  <div class="page-head">
    <div class="ph-icon">${ico('layers', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Precificação <span>›</span> Tabelas de Preço</p>
      <h1 class="ph-title">Tabelas de Preço</h1>
      <p class="ph-desc">Tabelas e regras de precificação por abrangência, regime tributário e margem-alvo. Base de todas as cotações.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Nova tabela</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por nome, abrangência ou regime..." /></div>
    <button class="btn btn-soft">Buscar</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros</button>
    <button class="btn btn-outline">${ico('download', 'ic4')} Exportar</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> de <strong>14</strong> tabelas</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Tabela')}</th>
          <th>Regime tributário</th>
          <th>${sortable('Margem-alvo')}</th>
          <th>${sortable('Vigência')}</th>
          <th>${sortable('Status')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${TABLES.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option></select></div>
      <div class="pg-nav"><button class="pg-btn" disabled>‹</button><button class="pg-btn active">1</button><button class="pg-btn">›</button></div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Precificação',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/09-pricing/pricing-tables-list.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/10-platform-admin/app-shell.js
try { (() => {
/* global window, document */
// HiperTMS shared app shell — window.AppShell.renderShell({ activeLabel, content }) + icons.

const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  docDup: '<rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h6"/>',
  map: '<path d="m9 5-6 2.4V20l6-2.4 6 2.4 6-2.4V5l-6 2.4z"/><path d="M9 5v12.6M15 7.4V20"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6 6 0 0 1 11.6 0"/>',
  store: '<path d="M2 7l1.5-3h17L22 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M16 6l2 2M19 3l2 2"/>',
  bolt: '<path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  dots: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'
};
function ico(name, cls) {
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const QUICK = [['doc', 'Cotações'], ['truck', 'Embarques'], ['clipboard', 'Cargas'], ['map', 'Viagens'], ['doc', 'CT-e'], ['docDup', 'MDF-e']];
const HUBS = [['trending', 'Vendas'], ['truck', 'Operação'], ['building', 'Cadastros'], ['wrench', 'Frota'], ['cart', 'Compras'], ['wallet', 'Financeiro'], ['users', 'Equipes'], ['layers', 'Precificação']];
const SYSTEM = [['chart', 'Administração'], ['userCircle', 'Minha Conta'], ['store', 'Dados da Empresa'], ['users', 'Usuários'], ['card', 'Assinatura e Cobrança'], ['wrench', 'Configuração da operação'], ['key', 'Sequenciadores'], ['bolt', 'Automação']];
function navRow(icon, label, active) {
  return `<button class="navrow${active ? ' active' : ''}" type="button">
    <span class="navicon">${active ? '<span class="dot"></span>' : ''}${ico(icon, 'ic5')}</span>
    <span class="navlabel">${label}</span>
  </button>`;
}
function renderShell({
  activeLabel = '',
  content = ''
} = {}) {
  const sidebar = `
  <aside class="sidebar">
    <div class="sb-head"><span class="wm"><span class="h">Hiper</span><span class="t">TMS</span></span></div>
    <div class="sb-scroll">
      <p class="sb-grouplabel">Acesso rápido</p>
      ${QUICK.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
      <div class="sb-divider"></div>
      ${HUBS.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
    </div>
    <div class="sb-foot">
      <button class="navrow sys-toggle" type="button" id="sys-toggle">
        <span class="navicon">${ico('chart', 'ic5')}</span><span class="navlabel">Sistema</span><span class="navchev">${ico('chevD', 'ic4')}</span>
      </button>
      <div class="sys-items" id="sys-items">${SYSTEM.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}</div>
      <div class="sb-version">HiperTMS v12</div>
    </div>
  </aside>`;
  const topbar = `
  <header class="topbar">
    <div class="tb-left"><button class="tenant"><span class="tenant-logo">TM</span><span class="tenant-name">Transportadora Modelo LTDA</span>${ico('chevR', 'ic4 muted')}</button></div>
    <div class="tb-center">${ico('calendar', 'ic4 muted')}<span class="dt"><span>Segunda-feira</span><span class="sep">|</span><span class="nums">09/06/2026</span><span class="sep">·</span><span class="nums">14:30</span></span></div>
    <div class="tb-right">
      <button class="iconbtn">${ico('chat', 'ic5')}</button>
      <button class="iconbtn">${ico('bell', 'ic5')}<span class="reddot"></span></button>
      <button class="iconbtn">${ico('moon', 'ic5')}</button>
      <button class="avatar">FO</button>
    </div>
  </header>`;
  return `<div class="shell">${sidebar}<div class="main">${topbar}<div class="scrollarea">${content}</div></div></div>`;
}
function mountShell(rootId, opts) {
  document.getElementById(rootId).innerHTML = renderShell(opts);
  const st = document.getElementById('sys-toggle');
  if (st) st.addEventListener('click', () => {
    document.getElementById('sys-items').classList.toggle('open');
    st.classList.toggle('expanded');
  });
}
window.AppShell = {
  ICONS,
  ico,
  renderShell,
  mountShell
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/10-platform-admin/app-shell.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/10-platform-admin/platform-tenants-list.js
try { (() => {
/* global window */
// Platform-admin · Tenants — list page on the shared shell. `ico` is global.

const TENANTS = [{
  nome: 'Transportadora Modelo LTDA',
  cnpj: '11.222.333/0001-44',
  plano: 'Essencial',
  users: '5 / 5',
  docs: '842 / 1.000',
  mrr: 'R$ 299,00',
  st: ['success', 'Ativo'],
  desde: '01/2025'
}, {
  nome: 'Rodoviário Brasil Express',
  cnpj: '22.333.444/0001-55',
  plano: 'Profissional',
  users: '12 / 15',
  docs: '3.210 / 5.000',
  mrr: 'R$ 599,00',
  st: ['success', 'Ativo'],
  desde: '08/2024'
}, {
  nome: 'LogPar Transportes',
  cnpj: '33.444.555/0001-66',
  plano: 'Básico',
  users: '1 / 1',
  docs: '120 / 500',
  mrr: 'R$ 89,00',
  st: ['warning', 'Trial'],
  desde: '05/2026'
}, {
  nome: 'Cargas do Vale ME',
  cnpj: '44.555.666/0001-77',
  plano: 'Essencial',
  users: '4 / 5',
  docs: '980 / 1.000',
  mrr: 'R$ 299,00',
  st: ['error', 'Inadimplente'],
  desde: '02/2025'
}, {
  nome: 'Translitoral S.A.',
  cnpj: '55.666.777/0001-88',
  plano: 'Profissional',
  users: '9 / 15',
  docs: '2.140 / 5.000',
  mrr: 'R$ 599,00',
  st: ['success', 'Ativo'],
  desde: '11/2024'
}, {
  nome: 'Expresso Norte-Sul',
  cnpj: '66.777.888/0001-99',
  plano: 'Básico',
  users: '1 / 1',
  docs: '60 / 500',
  mrr: 'R$ 0,00',
  st: ['secondary', 'Cancelado'],
  desde: '03/2026'
}];
function row(t) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar" style="background:#dcfce7;color:#166534">${ico('store', 'ic5')}</span><div style="min-width:0"><div class="name">${t.nome}</div><div class="doc">${t.cnpj}</div></div></div></td>
    <td><span class="badge info">${t.plano}</span></td>
    <td class="cell-num">${t.users}</td>
    <td class="cell-num">${t.docs}</td>
    <td class="cell-num">${t.mrr}</td>
    <td><span class="badge ${t.st[0]}">${t.st[1]}</span></td>
    <td class="cell-date">${t.desde}</td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
function kpi(label, value, sub, cls) {
  return `<div class="kpi-card"><p class="kpi-label">${label}</p><p class="kpi-value">${value}</p><p class="kpi-sub ${cls || ''}">${sub}</p></div>`;
}
const content = `
<div class="page" data-screen-label="Tenants">
  <div class="page-head">
    <div class="ph-icon">${ico('chart', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Administração <span>›</span> Tenants</p>
      <h1 class="ph-title">Tenants</h1>
      <p class="ph-desc">Empresas assinantes da plataforma: plano, consumo, faturamento recorrente e situação da assinatura.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Novo tenant</button>
  </div>

  <div class="kpi-row">
    ${kpi('MRR total', 'R$ 184.7k', '▲ 6,2% vs. mês anterior', 'pos')}
    ${kpi('Tenants ativos', '312', '▲ 14 novos no mês', 'pos')}
    ${kpi('Trials abertos', '28', '9 expiram em 7 dias', 'warn')}
    ${kpi('Inadimplência', '4,1%', '▲ 0,3 p.p.', 'neg')}
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por razão social ou CNPJ..." /></div>
    <button class="btn btn-soft">Buscar</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros</button>
    <button class="btn btn-outline">${ico('download', 'ic4')} Exportar</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> de <strong>312</strong> tenants</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Tenant')}</th>
          <th>Plano</th>
          <th>${sortable('Usuários')}</th>
          <th>${sortable('Documentos')}</th>
          <th>${sortable('MRR')}</th>
          <th>${sortable('Status')}</th>
          <th>${sortable('Cliente desde')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${TENANTS.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option><option>100</option></select></div>
      <div class="pg-nav"><button class="pg-btn" disabled>‹</button><button class="pg-btn active">1</button><button class="pg-btn">2</button><button class="pg-btn">3</button><span class="pg-info">…</span><button class="pg-btn">52</button><button class="pg-btn">›</button></div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Administração',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/10-platform-admin/platform-tenants-list.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/11-tenant-admin/app-shell.js
try { (() => {
/* global window, document */
// HiperTMS shared app shell — window.AppShell.renderShell({ activeLabel, content }) + icons.

const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  docDup: '<rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h6"/>',
  map: '<path d="m9 5-6 2.4V20l6-2.4 6 2.4 6-2.4V5l-6 2.4z"/><path d="M9 5v12.6M15 7.4V20"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6 6 0 0 1 11.6 0"/>',
  store: '<path d="M2 7l1.5-3h17L22 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M16 6l2 2M19 3l2 2"/>',
  bolt: '<path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  dots: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'
};
function ico(name, cls) {
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const QUICK = [['doc', 'Cotações'], ['truck', 'Embarques'], ['clipboard', 'Cargas'], ['map', 'Viagens'], ['doc', 'CT-e'], ['docDup', 'MDF-e']];
const HUBS = [['trending', 'Vendas'], ['truck', 'Operação'], ['building', 'Cadastros'], ['wrench', 'Frota'], ['cart', 'Compras'], ['wallet', 'Financeiro'], ['users', 'Equipes'], ['layers', 'Precificação']];
const SYSTEM = [['chart', 'Administração'], ['userCircle', 'Minha Conta'], ['store', 'Dados da Empresa'], ['users', 'Usuários'], ['card', 'Assinatura e Cobrança'], ['wrench', 'Configuração da operação'], ['key', 'Sequenciadores'], ['bolt', 'Automação']];
function navRow(icon, label, active) {
  return `<button class="navrow${active ? ' active' : ''}" type="button">
    <span class="navicon">${active ? '<span class="dot"></span>' : ''}${ico(icon, 'ic5')}</span>
    <span class="navlabel">${label}</span>
  </button>`;
}
function renderShell({
  activeLabel = '',
  content = ''
} = {}) {
  const sidebar = `
  <aside class="sidebar">
    <div class="sb-head"><span class="wm"><span class="h">Hiper</span><span class="t">TMS</span></span></div>
    <div class="sb-scroll">
      <p class="sb-grouplabel">Acesso rápido</p>
      ${QUICK.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
      <div class="sb-divider"></div>
      ${HUBS.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
    </div>
    <div class="sb-foot">
      <button class="navrow sys-toggle" type="button" id="sys-toggle">
        <span class="navicon">${ico('chart', 'ic5')}</span><span class="navlabel">Sistema</span><span class="navchev">${ico('chevD', 'ic4')}</span>
      </button>
      <div class="sys-items" id="sys-items">${SYSTEM.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}</div>
      <div class="sb-version">HiperTMS v12</div>
    </div>
  </aside>`;
  const topbar = `
  <header class="topbar">
    <div class="tb-left"><button class="tenant"><span class="tenant-logo">TM</span><span class="tenant-name">Transportadora Modelo LTDA</span>${ico('chevR', 'ic4 muted')}</button></div>
    <div class="tb-center">${ico('calendar', 'ic4 muted')}<span class="dt"><span>Segunda-feira</span><span class="sep">|</span><span class="nums">09/06/2026</span><span class="sep">·</span><span class="nums">14:30</span></span></div>
    <div class="tb-right">
      <button class="iconbtn">${ico('chat', 'ic5')}</button>
      <button class="iconbtn">${ico('bell', 'ic5')}<span class="reddot"></span></button>
      <button class="iconbtn">${ico('moon', 'ic5')}</button>
      <button class="avatar">FO</button>
    </div>
  </header>`;
  return `<div class="shell">${sidebar}<div class="main">${topbar}<div class="scrollarea">${content}</div></div></div>`;
}
function mountShell(rootId, opts) {
  document.getElementById(rootId).innerHTML = renderShell(opts);
  const st = document.getElementById('sys-toggle');
  if (st) st.addEventListener('click', () => {
    document.getElementById('sys-items').classList.toggle('open');
    st.classList.toggle('expanded');
  });
}
window.AppShell = {
  ICONS,
  ico,
  renderShell,
  mountShell
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/11-tenant-admin/app-shell.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/11-tenant-admin/tenant-users-list.js
try { (() => {
/* global window */
// Tenant-admin · Usuários — list page on the shared shell. `ico` is global.

const USERS = [{
  nome: 'Fábio Ogawa',
  email: 'fabio@transportadoramodelo.com.br',
  papel: 'Administrador',
  pcls: 'error',
  acesso: 'Agora há pouco',
  st: ['success', 'Ativo'],
  ini: 'FO'
}, {
  nome: 'Mariana Costa',
  email: 'mariana@transportadoramodelo.com.br',
  papel: 'Financeiro',
  pcls: 'info',
  acesso: 'Hoje, 11:42',
  st: ['success', 'Ativo'],
  ini: 'MC'
}, {
  nome: 'Rafael Lima',
  email: 'rafael@transportadoramodelo.com.br',
  papel: 'Operação',
  pcls: 'warning',
  acesso: 'Ontem, 18:10',
  st: ['success', 'Ativo'],
  ini: 'RL'
}, {
  nome: 'Juliana Prado',
  email: 'juliana@transportadoramodelo.com.br',
  papel: 'Comercial',
  pcls: 'secondary',
  acesso: 'há 3 dias',
  st: ['success', 'Ativo'],
  ini: 'JP'
}, {
  nome: 'Carlos Mendes',
  email: 'carlos@transportadoramodelo.com.br',
  papel: 'Operação',
  pcls: 'warning',
  acesso: 'há 2 semanas',
  st: ['warning', 'Convite pendente'],
  ini: 'CM'
}, {
  nome: 'Ana Beatriz',
  email: 'ana@transportadoramodelo.com.br',
  papel: 'Somente leitura',
  pcls: 'secondary',
  acesso: 'Nunca',
  st: ['secondary', 'Inativo'],
  ini: 'AB'
}];
const AVCOL = ['#0284c7', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];
function row(u, i) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar" style="background:${AVCOL[i % AVCOL.length]};color:#fff;font-size:12px;font-weight:700">${u.ini}</span><div style="min-width:0"><div class="name">${u.nome}</div><div class="doc" style="font-family:inherit">${u.email}</div></div></div></td>
    <td><span class="badge ${u.pcls}">${u.papel}</span></td>
    <td class="cell-date">${u.acesso}</td>
    <td><span class="badge ${u.st[0]}">${u.st[1]}</span></td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="Usuários">
  <div class="page-head">
    <div class="ph-icon">${ico('users', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Sistema <span>›</span> Usuários</p>
      <h1 class="ph-title">Usuários</h1>
      <p class="ph-desc">Membros da equipe com acesso ao sistema: papel/permissões, status do convite e último acesso.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Convidar usuário</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por nome ou email..." /></div>
    <button class="btn btn-soft">Buscar</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Papel</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> de <strong>6</strong> usuários · <strong>5</strong> de <strong>5</strong> assentos usados</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Usuário')}</th>
          <th>${sortable('Papel')}</th>
          <th>${sortable('Último acesso')}</th>
          <th>${sortable('Status')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${USERS.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option></select></div>
      <div class="pg-nav"><button class="pg-btn" disabled>‹</button><button class="pg-btn active">1</button><button class="pg-btn">›</button></div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Usuários',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/11-tenant-admin/tenant-users-list.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/12-work/app-shell.js
try { (() => {
/* global window, document */
// HiperTMS shared app shell — window.AppShell.renderShell({ activeLabel, content }) + icons.

const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  docDup: '<rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h6"/>',
  map: '<path d="m9 5-6 2.4V20l6-2.4 6 2.4 6-2.4V5l-6 2.4z"/><path d="M9 5v12.6M15 7.4V20"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6 6 0 0 1 11.6 0"/>',
  store: '<path d="M2 7l1.5-3h17L22 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M16 6l2 2M19 3l2 2"/>',
  bolt: '<path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  dots: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'
};
function ico(name, cls) {
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const QUICK = [['doc', 'Cotações'], ['truck', 'Embarques'], ['clipboard', 'Cargas'], ['map', 'Viagens'], ['doc', 'CT-e'], ['docDup', 'MDF-e']];
const HUBS = [['trending', 'Vendas'], ['truck', 'Operação'], ['building', 'Cadastros'], ['wrench', 'Frota'], ['cart', 'Compras'], ['wallet', 'Financeiro'], ['users', 'Equipes'], ['layers', 'Precificação']];
const SYSTEM = [['chart', 'Administração'], ['userCircle', 'Minha Conta'], ['store', 'Dados da Empresa'], ['users', 'Usuários'], ['card', 'Assinatura e Cobrança'], ['wrench', 'Configuração da operação'], ['key', 'Sequenciadores'], ['bolt', 'Automação']];
function navRow(icon, label, active) {
  return `<button class="navrow${active ? ' active' : ''}" type="button">
    <span class="navicon">${active ? '<span class="dot"></span>' : ''}${ico(icon, 'ic5')}</span>
    <span class="navlabel">${label}</span>
  </button>`;
}
function renderShell({
  activeLabel = '',
  content = ''
} = {}) {
  const sidebar = `
  <aside class="sidebar">
    <div class="sb-head"><span class="wm"><span class="h">Hiper</span><span class="t">TMS</span></span></div>
    <div class="sb-scroll">
      <p class="sb-grouplabel">Acesso rápido</p>
      ${QUICK.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
      <div class="sb-divider"></div>
      ${HUBS.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
    </div>
    <div class="sb-foot">
      <button class="navrow sys-toggle" type="button" id="sys-toggle">
        <span class="navicon">${ico('chart', 'ic5')}</span><span class="navlabel">Sistema</span><span class="navchev">${ico('chevD', 'ic4')}</span>
      </button>
      <div class="sys-items" id="sys-items">${SYSTEM.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}</div>
      <div class="sb-version">HiperTMS v12</div>
    </div>
  </aside>`;
  const topbar = `
  <header class="topbar">
    <div class="tb-left"><button class="tenant"><span class="tenant-logo">TM</span><span class="tenant-name">Transportadora Modelo LTDA</span>${ico('chevR', 'ic4 muted')}</button></div>
    <div class="tb-center">${ico('calendar', 'ic4 muted')}<span class="dt"><span>Segunda-feira</span><span class="sep">|</span><span class="nums">09/06/2026</span><span class="sep">·</span><span class="nums">14:30</span></span></div>
    <div class="tb-right">
      <button class="iconbtn">${ico('chat', 'ic5')}</button>
      <button class="iconbtn">${ico('bell', 'ic5')}<span class="reddot"></span></button>
      <button class="iconbtn">${ico('moon', 'ic5')}</button>
      <button class="avatar">FO</button>
    </div>
  </header>`;
  return `<div class="shell">${sidebar}<div class="main">${topbar}<div class="scrollarea">${content}</div></div></div>`;
}
function mountShell(rootId, opts) {
  document.getElementById(rootId).innerHTML = renderShell(opts);
  const st = document.getElementById('sys-toggle');
  if (st) st.addEventListener('click', () => {
    document.getElementById('sys-items').classList.toggle('open');
    st.classList.toggle('expanded');
  });
}
window.AppShell = {
  ICONS,
  ico,
  renderShell,
  mountShell
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/12-work/app-shell.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/12-work/work-tasks-list.js
try { (() => {
/* global window */
// Work · Tarefas — list page on the shared shell. `ico` is global.

const TASKS = [{
  titulo: 'Aprovar cotação COT-2026-0460',
  ctx: 'Atacadão Primavera · R$ 7.210,00',
  prio: ['error', 'Alta'],
  resp: 'MC',
  prazo: 'Hoje, 17:00',
  st: ['warning', 'Em aberto']
}, {
  titulo: 'Renovar CRLV — placa JKL0M12',
  ctx: 'Frota · VW Constellation',
  prio: ['error', 'Alta'],
  resp: 'RL',
  prazo: 'Amanhã',
  st: ['warning', 'Em aberto']
}, {
  titulo: 'Conferir CT-e rejeitado 000.1282',
  ctx: 'Fiscal · rejeição SEFAZ cód. 539',
  prio: ['warning', 'Média'],
  resp: 'FO',
  prazo: '11/06/2026',
  st: ['info', 'Em andamento']
}, {
  titulo: 'Cobrança — fatura vencida #4821',
  ctx: 'Financeiro · Cargas do Vale ME',
  prio: ['warning', 'Média'],
  resp: 'MC',
  prazo: '12/06/2026',
  st: ['info', 'Em andamento']
}, {
  titulo: 'Agendar exame toxicológico',
  ctx: 'Motorista · Carlos Mendes',
  prio: ['secondary', 'Baixa'],
  resp: 'RL',
  prazo: '18/06/2026',
  st: ['warning', 'Em aberto']
}, {
  titulo: 'Follow-up proposta Vale Verde',
  ctx: 'Comercial · contrato dedicado',
  prio: ['secondary', 'Baixa'],
  resp: 'JP',
  prazo: '20/06/2026',
  st: ['success', 'Concluída']
}];
const AVCOL = {
  FO: '#0284c7',
  MC: '#16a34a',
  RL: '#d97706',
  JP: '#7c3aed'
};
function row(t) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div style="min-width:240px"><div class="name" style="font-size:14px;font-weight:500;white-space:normal">${t.titulo}</div><div class="cell-sub" style="margin-top:2px">${t.ctx}</div></div></td>
    <td><span class="badge ${t.prio[0]}">${t.prio[1]}</span></td>
    <td><span class="cell-avatar" style="width:28px;height:28px;border-radius:50%;background:${AVCOL[t.resp]};color:#fff;font-size:11px;font-weight:700">${t.resp}</span></td>
    <td class="cell-date">${t.prazo}</td>
    <td><span class="badge ${t.st[0]}">${t.st[1]}</span></td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="Tarefas">
  <div class="page-head">
    <div class="ph-icon">${ico('clipboard', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Equipes <span>›</span> Tarefas</p>
      <h1 class="ph-title">Tarefas</h1>
      <p class="ph-desc">Pendências da operação atribuídas à equipe: prioridade, responsável e prazo. Geradas por eventos do sistema ou criadas manualmente.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Nova tarefa</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar tarefa..." /></div>
    <button class="btn btn-soft">Minhas</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> tarefas · <strong>4</strong> em aberto · <strong>1</strong> vence hoje</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Tarefa')}</th>
          <th>${sortable('Prioridade')}</th>
          <th>Resp.</th>
          <th>${sortable('Prazo')}</th>
          <th>${sortable('Status')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${TASKS.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option></select></div>
      <div class="pg-nav"><button class="pg-btn" disabled>‹</button><button class="pg-btn active">1</button><button class="pg-btn">›</button></div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Equipes',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/12-work/work-tasks-list.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/13-procurement/app-shell.js
try { (() => {
/* global window, document */
// HiperTMS shared app shell — window.AppShell.renderShell({ activeLabel, content }) + icons.

const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  docDup: '<rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h6"/>',
  map: '<path d="m9 5-6 2.4V20l6-2.4 6 2.4 6-2.4V5l-6 2.4z"/><path d="M9 5v12.6M15 7.4V20"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6 6 0 0 1 11.6 0"/>',
  store: '<path d="M2 7l1.5-3h17L22 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M16 6l2 2M19 3l2 2"/>',
  bolt: '<path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  dots: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'
};
function ico(name, cls) {
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const QUICK = [['doc', 'Cotações'], ['truck', 'Embarques'], ['clipboard', 'Cargas'], ['map', 'Viagens'], ['doc', 'CT-e'], ['docDup', 'MDF-e']];
const HUBS = [['trending', 'Vendas'], ['truck', 'Operação'], ['building', 'Cadastros'], ['wrench', 'Frota'], ['cart', 'Compras'], ['wallet', 'Financeiro'], ['users', 'Equipes'], ['layers', 'Precificação']];
const SYSTEM = [['chart', 'Administração'], ['userCircle', 'Minha Conta'], ['store', 'Dados da Empresa'], ['users', 'Usuários'], ['card', 'Assinatura e Cobrança'], ['wrench', 'Configuração da operação'], ['key', 'Sequenciadores'], ['bolt', 'Automação']];
function navRow(icon, label, active) {
  return `<button class="navrow${active ? ' active' : ''}" type="button">
    <span class="navicon">${active ? '<span class="dot"></span>' : ''}${ico(icon, 'ic5')}</span>
    <span class="navlabel">${label}</span>
  </button>`;
}
function renderShell({
  activeLabel = '',
  content = ''
} = {}) {
  const sidebar = `
  <aside class="sidebar">
    <div class="sb-head"><span class="wm"><span class="h">Hiper</span><span class="t">TMS</span></span></div>
    <div class="sb-scroll">
      <p class="sb-grouplabel">Acesso rápido</p>
      ${QUICK.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
      <div class="sb-divider"></div>
      ${HUBS.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
    </div>
    <div class="sb-foot">
      <button class="navrow sys-toggle" type="button" id="sys-toggle">
        <span class="navicon">${ico('chart', 'ic5')}</span><span class="navlabel">Sistema</span><span class="navchev">${ico('chevD', 'ic4')}</span>
      </button>
      <div class="sys-items" id="sys-items">${SYSTEM.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}</div>
      <div class="sb-version">HiperTMS v12</div>
    </div>
  </aside>`;
  const topbar = `
  <header class="topbar">
    <div class="tb-left"><button class="tenant"><span class="tenant-logo">TM</span><span class="tenant-name">Transportadora Modelo LTDA</span>${ico('chevR', 'ic4 muted')}</button></div>
    <div class="tb-center">${ico('calendar', 'ic4 muted')}<span class="dt"><span>Segunda-feira</span><span class="sep">|</span><span class="nums">09/06/2026</span><span class="sep">·</span><span class="nums">14:30</span></span></div>
    <div class="tb-right">
      <button class="iconbtn">${ico('chat', 'ic5')}</button>
      <button class="iconbtn">${ico('bell', 'ic5')}<span class="reddot"></span></button>
      <button class="iconbtn">${ico('moon', 'ic5')}</button>
      <button class="avatar">FO</button>
    </div>
  </header>`;
  return `<div class="shell">${sidebar}<div class="main">${topbar}<div class="scrollarea">${content}</div></div></div>`;
}
function mountShell(rootId, opts) {
  document.getElementById(rootId).innerHTML = renderShell(opts);
  const st = document.getElementById('sys-toggle');
  if (st) st.addEventListener('click', () => {
    document.getElementById('sys-items').classList.toggle('open');
    st.classList.toggle('expanded');
  });
}
window.AppShell = {
  ICONS,
  ico,
  renderShell,
  mountShell
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/13-procurement/app-shell.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/13-procurement/procurement-orders-list.js
try { (() => {
/* global window */
// Compras · Pedidos de Compra — list page on the shared shell. `ico` is global.

const ORDERS = [{
  num: 'PC-2026-0188',
  forn: 'Posto Rede Sul LTDA',
  cat: 'Combustível',
  itens: '1 item',
  valor: 'R$ 18.400,00',
  entrega: '12/06/2026',
  st: ['success', 'Recebido']
}, {
  num: 'PC-2026-0187',
  forn: 'Oficina Central Diesel',
  cat: 'Manutenção',
  itens: '4 itens',
  valor: 'R$ 6.250,00',
  entrega: '14/06/2026',
  st: ['warning', 'Aguardando entrega']
}, {
  num: 'PC-2026-0186',
  forn: 'Pneus & Cia',
  cat: 'Pneus',
  itens: '8 itens',
  valor: 'R$ 22.880,00',
  entrega: '18/06/2026',
  st: ['info', 'Aprovado']
}, {
  num: 'PC-2026-0185',
  forn: 'Distribuidora de Peças MG',
  cat: 'Peças',
  itens: '12 itens',
  valor: 'R$ 4.120,50',
  entrega: '—',
  st: ['secondary', 'Em cotação']
}, {
  num: 'PC-2026-0184',
  forn: 'Lubrificantes Brasil',
  cat: 'Lubrificantes',
  itens: '3 itens',
  valor: 'R$ 2.940,00',
  entrega: '10/06/2026',
  st: ['error', 'Cancelado']
}, {
  num: 'PC-2026-0183',
  forn: 'TI Soluções Corporativas',
  cat: 'Serviços',
  itens: '1 item',
  valor: 'R$ 1.500,00',
  entrega: '09/06/2026',
  st: ['success', 'Recebido']
}];
function row(o) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar" style="background:#e0f2fe;color:#075985">${ico('cart', 'ic5')}</span><div style="min-width:0"><div class="name" style="font-family:'JetBrains Mono',monospace;font-size:13px">${o.num}</div><div class="doc" style="font-family:inherit">${o.forn}</div></div></div></td>
    <td><span class="badge secondary">${o.cat}</span></td>
    <td><span class="cell-num" style="color:var(--fg-muted)">${o.itens}</span></td>
    <td class="cell-num">${o.valor}</td>
    <td class="cell-date">${o.entrega}</td>
    <td><span class="badge ${o.st[0]}">${o.st[1]}</span></td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="Pedidos de Compra">
  <div class="page-head">
    <div class="ph-icon">${ico('cart', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Compras <span>›</span> Pedidos</p>
      <h1 class="ph-title">Pedidos de Compra</h1>
      <p class="ph-desc">Aquisições de combustível, peças, pneus e serviços. Do pedido ao recebimento, integrando estoque e financeiro.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Novo pedido</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por número, fornecedor ou categoria..." /></div>
    <button class="btn btn-soft">Buscar</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros</button>
    <button class="btn btn-outline">${ico('download', 'ic4')} Exportar</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> de <strong>41</strong> pedidos</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Pedido')}</th>
          <th>Categoria</th>
          <th>Itens</th>
          <th>${sortable('Valor')}</th>
          <th>${sortable('Entrega')}</th>
          <th>${sortable('Status')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${ORDERS.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option></select></div>
      <div class="pg-nav"><button class="pg-btn" disabled>‹</button><button class="pg-btn active">1</button><button class="pg-btn">2</button><button class="pg-btn">›</button></div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Compras',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/13-procurement/procurement-orders-list.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/14-account/account-profile.js
try { (() => {
/* global window */
// Conta · Minha Conta — settings/profile form on the shared shell. `ico` is global.

const content = `
<div class="page form-wrap" data-screen-label="Minha Conta">
  <div class="page-head">
    <div class="ph-icon">${ico('userCircle', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Sistema <span>›</span> Minha Conta</p>
      <h1 class="ph-title">Minha Conta</h1>
      <p class="ph-desc">Seus dados de perfil, preferências e segurança da conta.</p>
    </div>
  </div>

  <div class="form-card">
    <div class="form-section-head"><h3>Perfil</h3><p>Como você aparece para a sua equipe.</p></div>
    <div class="form-body">
      <div class="profile-row">
        <span class="profile-avatar">FO</span>
        <div class="profile-meta">
          <p class="profile-name">Fábio Ogawa</p>
          <p class="profile-mail">fabio@transportadoramodelo.com.br</p>
          <div class="profile-actions"><button class="btn btn-outline">Alterar foto</button><button class="btn btn-soft">Remover</button></div>
        </div>
      </div>
      <div class="form-grid" style="margin-top:20px">
        <div class="field"><label>Nome completo <span class="req">*</span></label><input type="text" value="Fábio Ogawa" /></div>
        <div class="field"><label>Cargo</label><input type="text" value="Administrador" /></div>
        <div class="field"><label>Email <span class="req">*</span></label><input type="email" value="fabio@transportadoramodelo.com.br" /></div>
        <div class="field"><label>Telefone</label><input type="tel" value="(41) 99876-5432" /></div>
      </div>
    </div>
  </div>

  <div class="form-card">
    <div class="form-section-head"><h3>Preferências</h3><p>Idioma, fuso e notificações.</p></div>
    <div class="form-body">
      <div class="form-grid">
        <div class="field"><label>Idioma</label><select><option>Português (Brasil)</option><option>English (US)</option><option>Español</option></select></div>
        <div class="field"><label>Fuso horário</label><select><option>(GMT-03:00) Brasília</option><option>(GMT-04:00) Cuiabá</option><option>(GMT-05:00) Acre</option></select></div>
      </div>
      <div class="toggle-list">
        <div class="toggle-row"><div><p class="tg-title">Notificações por email</p><p class="tg-desc">Resumos diários e alertas de pendências da operação.</p></div><span class="switch on" role="switch"></span></div>
        <div class="toggle-row"><div><p class="tg-title">Alertas de vencimento</p><p class="tg-desc">CNH, licenciamento, manutenção e exames da frota.</p></div><span class="switch on" role="switch"></span></div>
        <div class="toggle-row"><div><p class="tg-title">Novidades do produto</p><p class="tg-desc">Avisos ocasionais sobre novos recursos.</p></div><span class="switch" role="switch"></span></div>
      </div>
    </div>
  </div>

  <div class="form-card">
    <div class="form-section-head"><h3>Segurança</h3><p>Senha e autenticação.</p></div>
    <div class="form-body">
      <div class="form-grid">
        <div class="field"><label>Senha atual</label><input type="password" placeholder="••••••••" /></div>
        <div class="field"><!-- spacer --></div>
        <div class="field"><label>Nova senha</label><input type="password" placeholder="••••••••" /></div>
        <div class="field"><label>Confirmar nova senha</label><input type="password" placeholder="••••••••" /></div>
      </div>
      <div class="toggle-list" style="margin-top:4px">
        <div class="toggle-row"><div><p class="tg-title">Verificação em duas etapas (2FA)</p><p class="tg-desc">Camada extra de segurança no login.</p></div><button class="btn btn-outline">Ativar</button></div>
      </div>
    </div>
  </div>

  <div class="form-actions">
    <button class="btn btn-outline">Cancelar</button>
    <button class="btn btn-primary">Salvar alterações</button>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Minha Conta',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/14-account/account-profile.js", error: String((e && e.message) || e) }); }

// handoff_hipertms/14-account/app-shell.js
try { (() => {
/* global window, document */
// HiperTMS shared app shell — window.AppShell.renderShell({ activeLabel, content }) + icons.

const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  docDup: '<rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h6"/>',
  map: '<path d="m9 5-6 2.4V20l6-2.4 6 2.4 6-2.4V5l-6 2.4z"/><path d="M9 5v12.6M15 7.4V20"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6 6 0 0 1 11.6 0"/>',
  store: '<path d="M2 7l1.5-3h17L22 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M16 6l2 2M19 3l2 2"/>',
  bolt: '<path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  dots: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'
};
function ico(name, cls) {
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const QUICK = [['doc', 'Cotações'], ['truck', 'Embarques'], ['clipboard', 'Cargas'], ['map', 'Viagens'], ['doc', 'CT-e'], ['docDup', 'MDF-e']];
const HUBS = [['trending', 'Vendas'], ['truck', 'Operação'], ['building', 'Cadastros'], ['wrench', 'Frota'], ['cart', 'Compras'], ['wallet', 'Financeiro'], ['users', 'Equipes'], ['layers', 'Precificação']];
const SYSTEM = [['chart', 'Administração'], ['userCircle', 'Minha Conta'], ['store', 'Dados da Empresa'], ['users', 'Usuários'], ['card', 'Assinatura e Cobrança'], ['wrench', 'Configuração da operação'], ['key', 'Sequenciadores'], ['bolt', 'Automação']];
function navRow(icon, label, active) {
  return `<button class="navrow${active ? ' active' : ''}" type="button">
    <span class="navicon">${active ? '<span class="dot"></span>' : ''}${ico(icon, 'ic5')}</span>
    <span class="navlabel">${label}</span>
  </button>`;
}
function renderShell({
  activeLabel = '',
  content = ''
} = {}) {
  const sidebar = `
  <aside class="sidebar">
    <div class="sb-head"><span class="wm"><span class="h">Hiper</span><span class="t">TMS</span></span></div>
    <div class="sb-scroll">
      <p class="sb-grouplabel">Acesso rápido</p>
      ${QUICK.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
      <div class="sb-divider"></div>
      ${HUBS.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
    </div>
    <div class="sb-foot">
      <button class="navrow sys-toggle" type="button" id="sys-toggle">
        <span class="navicon">${ico('chart', 'ic5')}</span><span class="navlabel">Sistema</span><span class="navchev">${ico('chevD', 'ic4')}</span>
      </button>
      <div class="sys-items" id="sys-items">${SYSTEM.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}</div>
      <div class="sb-version">HiperTMS v12</div>
    </div>
  </aside>`;
  const topbar = `
  <header class="topbar">
    <div class="tb-left"><button class="tenant"><span class="tenant-logo">TM</span><span class="tenant-name">Transportadora Modelo LTDA</span>${ico('chevR', 'ic4 muted')}</button></div>
    <div class="tb-center">${ico('calendar', 'ic4 muted')}<span class="dt"><span>Segunda-feira</span><span class="sep">|</span><span class="nums">09/06/2026</span><span class="sep">·</span><span class="nums">14:30</span></span></div>
    <div class="tb-right">
      <button class="iconbtn">${ico('chat', 'ic5')}</button>
      <button class="iconbtn">${ico('bell', 'ic5')}<span class="reddot"></span></button>
      <button class="iconbtn">${ico('moon', 'ic5')}</button>
      <button class="avatar">FO</button>
    </div>
  </header>`;
  return `<div class="shell">${sidebar}<div class="main">${topbar}<div class="scrollarea">${content}</div></div></div>`;
}
function mountShell(rootId, opts) {
  document.getElementById(rootId).innerHTML = renderShell(opts);
  const st = document.getElementById('sys-toggle');
  if (st) st.addEventListener('click', () => {
    document.getElementById('sys-items').classList.toggle('open');
    st.classList.toggle('expanded');
  });
}
window.AppShell = {
  ICONS,
  ico,
  renderShell,
  mountShell
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms/14-account/app-shell.js", error: String((e && e.message) || e) }); }

// handoff_hipertms_detalhes/app-shell.js
try { (() => {
/* global window, document */
// HiperTMS shared app shell — window.AppShell.renderShell({ activeLabel, content }) + icons.

const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  docDup: '<rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h6"/>',
  map: '<path d="m9 5-6 2.4V20l6-2.4 6 2.4 6-2.4V5l-6 2.4z"/><path d="M9 5v12.6M15 7.4V20"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6 6 0 0 1 11.6 0"/>',
  store: '<path d="M2 7l1.5-3h17L22 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M16 6l2 2M19 3l2 2"/>',
  bolt: '<path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  dots: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'
};
function ico(name, cls) {
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const QUICK = [['doc', 'Cotações'], ['truck', 'Embarques'], ['clipboard', 'Cargas'], ['map', 'Viagens'], ['doc', 'CT-e'], ['docDup', 'MDF-e']];
const HUBS = [['trending', 'Vendas'], ['truck', 'Operação'], ['building', 'Cadastros'], ['wrench', 'Frota'], ['cart', 'Compras'], ['wallet', 'Financeiro'], ['users', 'Equipes'], ['layers', 'Precificação']];
const SYSTEM = [['chart', 'Administração'], ['userCircle', 'Minha Conta'], ['store', 'Dados da Empresa'], ['users', 'Usuários'], ['card', 'Assinatura e Cobrança'], ['wrench', 'Configuração da operação'], ['key', 'Sequenciadores'], ['bolt', 'Automação']];
function navRow(icon, label, active) {
  return `<button class="navrow${active ? ' active' : ''}" type="button">
    <span class="navicon">${active ? '<span class="dot"></span>' : ''}${ico(icon, 'ic5')}</span>
    <span class="navlabel">${label}</span>
  </button>`;
}
function renderShell({
  activeLabel = '',
  content = ''
} = {}) {
  const sidebar = `
  <aside class="sidebar">
    <div class="sb-head"><span class="wm"><span class="h">Hiper</span><span class="t">TMS</span></span></div>
    <div class="sb-scroll">
      <p class="sb-grouplabel">Acesso rápido</p>
      ${QUICK.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
      <div class="sb-divider"></div>
      ${HUBS.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}
    </div>
    <div class="sb-foot">
      <button class="navrow sys-toggle" type="button" id="sys-toggle">
        <span class="navicon">${ico('chart', 'ic5')}</span><span class="navlabel">Sistema</span><span class="navchev">${ico('chevD', 'ic4')}</span>
      </button>
      <div class="sys-items" id="sys-items">${SYSTEM.map(([i, l]) => navRow(i, l, l === activeLabel)).join('')}</div>
      <div class="sb-version">HiperTMS v12</div>
    </div>
  </aside>`;
  const topbar = `
  <header class="topbar">
    <div class="tb-left"><button class="tenant"><span class="tenant-logo">TM</span><span class="tenant-name">Transportadora Modelo LTDA</span>${ico('chevR', 'ic4 muted')}</button></div>
    <div class="tb-center">${ico('calendar', 'ic4 muted')}<span class="dt"><span>Segunda-feira</span><span class="sep">|</span><span class="nums">09/06/2026</span><span class="sep">·</span><span class="nums">14:30</span></span></div>
    <div class="tb-right">
      <button class="iconbtn">${ico('chat', 'ic5')}</button>
      <button class="iconbtn">${ico('bell', 'ic5')}<span class="reddot"></span></button>
      <button class="iconbtn">${ico('moon', 'ic5')}</button>
      <button class="avatar">FO</button>
    </div>
  </header>`;
  return `<div class="shell">${sidebar}<div class="main">${topbar}<div class="scrollarea">${content}</div></div></div>`;
}
function mountShell(rootId, opts) {
  document.getElementById(rootId).innerHTML = renderShell(opts);
  const st = document.getElementById('sys-toggle');
  if (st) st.addEventListener('click', () => {
    document.getElementById('sys-items').classList.toggle('open');
    st.classList.toggle('expanded');
  });
}
window.AppShell = {
  ICONS,
  ico,
  renderShell,
  mountShell
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms_detalhes/app-shell.js", error: String((e && e.message) || e) }); }

// handoff_hipertms_detalhes/detail-cte.js
try { (() => {
/* global window, document */
// Fiscal · Detalhe do CT-e — document detail with SEFAZ event timeline. `ico` is global.

const content = `
<div class="page" data-screen-label="Detalhe do CT-e">
  <div class="detail-head">
    <div class="ph-icon">${ico('doc', 'ic6')}</div>
    <div class="dh-main">
      <p class="dh-eyebrow">Operação <span>›</span> CT-e <span>›</span> 000.1284</p>
      <div class="dh-title-row"><h1 class="dh-title">CT-e 000.1284 · Série 1</h1><span class="status-pill success">Autorizado</span></div>
      <p class="dh-sub">Chave 3526 0612 3456 7890 1234 5678 9012 3456 7890 8901</p>
    </div>
    <div class="dh-actions">
      <button class="btn btn-outline btn-icon" title="Baixar DACTE (PDF)">${ico('download', 'ic4')}</button>
      <button class="btn btn-outline">Carta de correção</button>
      <button class="btn btn-outline" style="color:var(--danger-ink);border-color:rgba(220,38,38,0.3)">Cancelar</button>
    </div>
  </div>

  <div class="detail-cols">
    <div>
      <div class="dcard">
        <div class="dcard-head"><h3>Partes</h3></div>
        <div class="dcard-body" style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
          <div class="party"><span class="pic">${ico('building', 'ic5')}</span><div><div class="pname">Transportadora Modelo LTDA</div><div class="pmeta">11.222.333/0001-44<br>Emitente (transportador)</div></div></div>
          <div class="party"><span class="pic">${ico('store', 'ic5')}</span><div><div class="pname">Autopeças União Ltda</div><div class="pmeta">São Paulo/SP<br>Remetente</div></div></div>
          <div class="party"><span class="pic">${ico('pin', 'ic5')}</span><div><div class="pname">CD Vale Verde Sul</div><div class="pmeta">Curitiba/PR<br>Destinatário</div></div></div>
          <div class="party"><span class="pic">${ico('userCircle', 'ic5')}</span><div><div class="pname">Indústria Vale Verde</div><div class="pmeta">45.678.901/0001-22<br>Tomador do serviço</div></div></div>
        </div>
      </div>

      <div class="dcard">
        <div class="dcard-head"><h3>Prestação &amp; tributos</h3></div>
        <div class="dcard-body"><div class="def-grid">
          <div class="def"><div class="k">CFOP</div><div class="v mono">6353 — Transporte (interestadual)</div></div>
          <div class="def"><div class="k">Natureza</div><div class="v">Prestação de serviço de transporte</div></div>
          <div class="def"><div class="k">Valor total da prestação</div><div class="v">R$ 4.863,64</div></div>
          <div class="def"><div class="k">Valor a receber</div><div class="v">R$ 4.863,64</div></div>
          <div class="def"><div class="k">Base de cálculo ICMS</div><div class="v">R$ 4.863,64</div></div>
          <div class="def"><div class="k">ICMS (12%)</div><div class="v">R$ 583,64</div></div>
          <div class="def"><div class="k">Protocolo de autorização</div><div class="v mono">135260612345678</div></div>
          <div class="def"><div class="k">Autorizado em</div><div class="v">09/06/2026 14:13:02</div></div>
        </div></div>
      </div>

      <div class="dcard">
        <div class="dcard-head"><h3>Documentos vinculados</h3></div>
        <div class="dcard-body" style="display:flex;flex-direction:column;gap:10px">
          <div class="party" style="align-items:center"><span class="pic" style="background:var(--warning-tint);color:var(--warning-ink)">${ico('docDup', 'ic5')}</span><div style="flex:1"><div class="pname">MDF-e 000.0712</div><div class="pmeta">Manifesto · Autorizado</div></div><span class="status-pill success" style="font-size:12px">OK</span></div>
          <div class="party" style="align-items:center"><span class="pic">${ico('truck', 'ic5')}</span><div style="flex:1"><div class="pname">Embarque EMB-2026-0461</div><div class="pmeta">Em trânsito</div></div><button class="btn btn-outline" style="height:32px;font-size:13px">Abrir</button></div>
        </div>
      </div>
    </div>

    <div class="summary-sticky">
      <div class="dcard">
        <div class="dcard-head"><h3>Eventos SEFAZ</h3></div>
        <div class="dcard-body">
          <div class="timeline">
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot success">${ico('docDup', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Vinculado ao MDF-e</div><div class="tl-meta">09/06/2026 14:20</div></div></div>
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot success">${ico('arrowR', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Autorizado o uso</div><div class="tl-meta">09/06/2026 14:13 · cStat 100</div><div class="tl-desc">Autorização de uso concedida pela SEFAZ-SP.</div></div></div>
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot info">${ico('doc', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Enviado para autorização</div><div class="tl-meta">09/06/2026 14:12</div></div></div>
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot muted">${ico('plus', 'ic4')}</div></div><div class="tl-body"><div class="tl-title">CT-e gerado</div><div class="tl-meta">09/06/2026 14:12 · Fábio Ogawa</div></div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'CT-e',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms_detalhes/detail-cte.js", error: String((e && e.message) || e) }); }

// handoff_hipertms_detalhes/detail-quote.js
try { (() => {
/* global window */
// Logística · Detalhe da Cotação — detail pattern on the shared shell. `ico` is global.

const FREIGHT = [['Frete-peso', 'SP → Curitiba · 408 km · 12.400 kg', 'R$ 4.000,00'], ['Ad valorem', '0,30% sobre R$ 180.000 (valor da carga)', 'R$ 540,00'], ['GRIS', 'Gerenciamento de risco · 0,10%', 'R$ 180,00'], ['Pedágio', '4 eixos · 6 praças', 'R$ 180,00'], ['Taxa de coleta', 'Coleta dedicada na origem', 'R$ 120,00']];
const TAXES = [['ICMS', '12% por dentro (PR)', 'R$ 583,64'], ['PIS', '0,65%', 'R$ 31,61'], ['COFINS', '3,00%', 'R$ 145,91']];
const COSTS = [['Combustível', '146 L · R$ 6,10/L (3,9 km/L)', 'R$ 890,60'], ['Motorista', 'Diária + comissão', 'R$ 520,00'], ['Manutenção/km', 'R$ 0,38/km · 408 km', 'R$ 155,04'], ['Pedágio (custo)', 'Repasse', 'R$ 180,00'], ['Custos fixos rateados', 'Frota + administrativo', 'R$ 885,02']];
function irow(name, sub, val, cls) {
  return `<tr><td><div class="it-name">${name}</div><div class="it-sub">${sub}</div></td><td class="num ${cls || ''}">${val}</td></tr>`;
}
const content = `
<div class="page" data-screen-label="Detalhe da Cotação">
  <div class="detail-head">
    <div class="ph-icon">${ico('doc', 'ic6')}</div>
    <div class="dh-main">
      <p class="dh-eyebrow">Vendas <span>›</span> Cotações <span>›</span> COT-2026-0461</p>
      <div class="dh-title-row">
        <h1 class="dh-title">COT-2026-0461</h1>
        <span class="status-pill success">Convertida</span>
      </div>
      <p class="dh-sub">Indústria Vale Verde · São Paulo/SP → Curitiba/PR · validade 12/06/2026</p>
    </div>
    <div class="dh-actions">
      <button class="btn btn-outline btn-icon" title="Baixar PDF">${ico('download', 'ic4')}</button>
      <button class="btn btn-outline btn-icon" title="Duplicar">${ico('docDup', 'ic4')}</button>
      <button class="btn btn-primary">${ico('truck', 'ic4')} Converter</button>
    </div>
  </div>

  <div class="tabbar">
    <button class="active" data-tab="precificacao">Precificação</button>
    <button data-tab="rota">Dados &amp; rota</button>
    <button data-tab="financeiro">Financeiro</button>
    <button data-tab="historico">Histórico</button>
  </div>

  <div class="tabpane active" id="precificacao">
    <div class="detail-cols">
      <div>
        <div class="dcard">
          <div class="dcard-head"><h3>Composição do frete</h3><span class="it-sub">5 itens</span></div>
          <table class="items">
            <thead><tr><th>Item</th><th class="num">Valor</th></tr></thead>
            <tbody>
              <tr class="group-head"><td colspan="2">Receita de frete</td></tr>
              ${FREIGHT.map(r => irow(r[0], r[1], r[2])).join('')}
              <tr class="group-head"><td colspan="2">Impostos sobre o frete</td></tr>
              ${TAXES.map(r => irow(r[0], r[1], r[2])).join('')}
              <tr class="group-head"><td colspan="2">Custos operacionais</td></tr>
              ${COSTS.map(r => irow(r[0], r[1], r[2])).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="summary-sticky">
        <div class="sum-card">
          <div class="sum-head"><h3>Análise crítica</h3></div>
          <div class="sum-body">
            <div class="sum-row"><span>Receita bruta</span><span class="v">R$ 5.020,00</span></div>
            <div class="sum-row sub"><span>Frete-peso + taxas</span><span class="v">R$ 5.020,00</span></div>
            <div class="sum-divider"></div>
            <div class="sum-row"><span>Impostos</span><span class="v">− R$ 761,16</span></div>
            <div class="sum-row"><span>Custos operacionais</span><span class="v">− R$ 2.630,66</span></div>
            <div class="sum-divider"></div>
            <div class="sum-total"><span class="lbl">Total ao cliente</span><span class="amt">R$ 5.020,00</span></div>
            <div class="sum-margin"><span class="lbl">Margem líquida</span><span class="amt">R$ 1.628,18 · 32,4%</span></div>
          </div>
          <div class="sum-foot"><button class="btn btn-primary" style="width:100%">Editar precificação</button></div>
        </div>
      </div>
    </div>
  </div>

  <div class="tabpane" id="rota">
    <div class="detail-cols">
      <div>
        <div class="dcard">
          <div class="dcard-head"><h3>Rota</h3></div>
          <div class="dcard-body">
            <div class="map-ph"><span class="pin-a"></span><span class="route"></span><span class="pin-b"></span>São Paulo/SP → Curitiba/PR · 408 km</div>
            <div class="def-grid" style="margin-top:16px">
              <div class="def"><div class="k">Origem</div><div class="v">São Paulo/SP — Vila Leopoldina</div></div>
              <div class="def"><div class="k">Destino</div><div class="v">Curitiba/PR — CIC</div></div>
              <div class="def"><div class="k">Distância</div><div class="v">408 km</div></div>
              <div class="def"><div class="k">Prazo estimado</div><div class="v">1 dia útil</div></div>
            </div>
          </div>
        </div>
        <div class="dcard">
          <div class="dcard-head"><h3>Carga</h3></div>
          <div class="dcard-body"><div class="def-grid">
            <div class="def"><div class="k">Mercadoria</div><div class="v">Autopeças (NF 12.4500)</div></div>
            <div class="def"><div class="k">Peso</div><div class="v">12.400 kg</div></div>
            <div class="def"><div class="k">Valor da carga</div><div class="v">R$ 180.000,00</div></div>
            <div class="def"><div class="k">Modalidade</div><div class="v">LCL · carga fracionada</div></div>
          </div></div>
        </div>
      </div>
      <div class="summary-sticky">
        <div class="dcard">
          <div class="dcard-head"><h3>Partes</h3></div>
          <div class="dcard-body" style="display:flex;flex-direction:column;gap:16px">
            <div class="party"><span class="pic">${ico('building', 'ic5')}</span><div><div class="pname">Indústria Vale Verde</div><div class="pmeta">45.678.901/0001-22<br>Tomador do frete</div></div></div>
            <div class="party"><span class="pic">${ico('store', 'ic5')}</span><div><div class="pname">Autopeças União Ltda</div><div class="pmeta">São Paulo/SP<br>Remetente</div></div></div>
            <div class="party"><span class="pic">${ico('pin', 'ic5')}</span><div><div class="pname">CD Vale Verde Sul</div><div class="pmeta">Curitiba/PR<br>Destinatário</div></div></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="tabpane" id="financeiro">
    <div class="dcard"><div class="dcard-head"><h3>Resumo financeiro</h3></div><div class="dcard-body"><div class="def-grid">
      <div class="def"><div class="k">Condição de pagamento</div><div class="v">Faturado · 28 dias</div></div>
      <div class="def"><div class="k">Forma</div><div class="v">Boleto bancário</div></div>
      <div class="def"><div class="k">CT-e vinculado</div><div class="v mono">000.1284 · Série 1</div></div>
      <div class="def"><div class="k">Fatura</div><div class="v">FAT-2026-0345 (em aberto)</div></div>
    </div></div></div>
  </div>

  <div class="tabpane" id="historico">
    <div class="dcard"><div class="dcard-head"><h3>Histórico da cotação</h3></div><div class="dcard-body">
      <div class="timeline">
        <div class="tl-item"><div class="tl-rail"><div class="tl-dot success">${ico('arrowR', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Convertida em embarque</div><div class="tl-meta">09/06/2026 14:12 · Fábio Ogawa</div><div class="tl-desc">Gerou o embarque EMB-2026-0461 e o CT-e 000.1284.</div></div></div>
        <div class="tl-item"><div class="tl-rail"><div class="tl-dot info">${ico('doc', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Aprovada pelo cliente</div><div class="tl-meta">08/06/2026 16:40</div></div></div>
        <div class="tl-item"><div class="tl-rail"><div class="tl-dot muted">${ico('doc', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Proposta enviada</div><div class="tl-meta">08/06/2026 09:15 · Juliana Prado</div></div></div>
        <div class="tl-item"><div class="tl-rail"><div class="tl-dot muted">${ico('plus', 'ic4')}</div></div><div class="tl-body"><div class="tl-title">Cotação criada</div><div class="tl-meta">07/06/2026 11:02 · Juliana Prado</div></div></div>
      </div>
    </div></div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Cotações',
  content
});
document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabbar button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === b.dataset.tab));
}));
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms_detalhes/detail-quote.js", error: String((e && e.message) || e) }); }

// handoff_hipertms_detalhes/detail-trip.js
try { (() => {
/* global window */
// Logística · Detalhe da Viagem — operational detail + stops timeline. `ico` is global.

const content = `
<div class="page" data-screen-label="Detalhe da Viagem">
  <div class="detail-head">
    <div class="ph-icon">${ico('map', 'ic6')}</div>
    <div class="dh-main">
      <p class="dh-eyebrow">Operação <span>›</span> Viagens <span>›</span> VG-2026-0207</p>
      <div class="dh-title-row"><h1 class="dh-title">VG-2026-0207</h1><span class="status-pill warning">Em andamento</span></div>
      <p class="dh-sub">Scania R450 · ABC1D23 · Motorista: Rafael Lima · São Paulo/SP → Curitiba/PR</p>
    </div>
    <div class="dh-actions">
      <button class="btn btn-outline btn-icon" title="Imprimir">${ico('download', 'ic4')}</button>
      <button class="btn btn-outline">Registrar evento</button>
      <button class="btn btn-primary">Concluir viagem</button>
    </div>
  </div>

  <div class="detail-cols">
    <div>
      <div class="dcard">
        <div class="dcard-head"><h3>Trajeto</h3><span class="it-sub">408 km · 2 paradas</span></div>
        <div class="dcard-body">
          <div class="map-ph"><span class="pin-a"></span><span class="route"></span><span class="pin-b"></span>São Paulo/SP → Curitiba/PR</div>
        </div>
      </div>

      <div class="dcard">
        <div class="dcard-head"><h3>Progresso da viagem</h3></div>
        <div class="dcard-body">
          <div class="timeline">
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot success">${ico('arrowR', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Saída da origem — São Paulo/SP</div><div class="tl-meta">09/06/2026 06:10 · KM 0</div><div class="tl-desc">Carga conferida e lacrada. MDF-e 000.0712 autorizado.</div></div></div>
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot success">${ico('pin', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Pedágio Régis Bittencourt</div><div class="tl-meta">09/06/2026 08:42 · KM 122</div></div></div>
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot info">${ico('truck', 'ic4')}</div><div class="tl-line"></div></div><div class="tl-body"><div class="tl-title">Em trânsito — BR-116</div><div class="tl-meta">Última posição: 11:58 · KM 263</div><div class="tl-desc">Velocidade média 58 km/h · ETA Curitiba 14:30.</div></div></div>
            <div class="tl-item"><div class="tl-rail"><div class="tl-dot muted">${ico('pin', 'ic4')}</div></div><div class="tl-body"><div class="tl-title">Entrega — Curitiba/PR (CD Vale Verde Sul)</div><div class="tl-meta">Previsto 09/06/2026 14:30 · KM 408</div></div></div>
          </div>
        </div>
      </div>
    </div>

    <div class="summary-sticky">
      <div class="dcard">
        <div class="dcard-head"><h3>Resumo</h3></div>
        <div class="dcard-body"><div class="def-grid" style="grid-template-columns:1fr 1fr">
          <div class="def"><div class="k">Distância</div><div class="v">408 km</div></div>
          <div class="def"><div class="k">Percorrido</div><div class="v">263 km · 64%</div></div>
          <div class="def"><div class="k">Veículo</div><div class="v mono">ABC1D23</div></div>
          <div class="def"><div class="k">Motorista</div><div class="v">Rafael Lima</div></div>
          <div class="def"><div class="k">Embarque</div><div class="v">EMB-2026-0461</div></div>
          <div class="def"><div class="k">CT-e</div><div class="v mono">000.1284</div></div>
        </div></div>
      </div>
      <div class="dcard">
        <div class="dcard-head"><h3>Custos da viagem</h3></div>
        <div class="dcard-body">
          <div class="sum-row"><span>Combustível (est.)</span><span class="v">R$ 890,60</span></div>
          <div class="sum-row" style="margin-top:8px"><span>Pedágio</span><span class="v">R$ 180,00</span></div>
          <div class="sum-row" style="margin-top:8px"><span>Diária motorista</span><span class="v">R$ 320,00</span></div>
          <div class="sum-divider" style="margin:12px 0"></div>
          <div class="sum-total"><span class="lbl">Custo total</span><span class="amt" style="font-size:18px">R$ 1.390,60</span></div>
        </div>
      </div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Viagens',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "handoff_hipertms_detalhes/detail-trip.js", error: String((e && e.message) || e) }); }

// logistics-quotes-list.js
try { (() => {
/* global window */
// Logística · Cotações — list page on the shared shell. `ico` is global.

const QUOTES = [{
  num: 'COT-2026-0461',
  cli: 'Indústria Vale Verde',
  rota: 'São Paulo/SP → Curitiba/PR',
  mod: 'LCL',
  valor: 'R$ 4.863,64',
  margem: '30,7%',
  mcls: 'success',
  st: ['success', 'Convertida'],
  val: '12/06/2026'
}, {
  num: 'COT-2026-0460',
  cli: 'Atacadão Primavera',
  rota: 'Goiânia/GO → Brasília/DF',
  mod: 'FCL',
  valor: 'R$ 7.210,00',
  margem: '24,1%',
  mcls: 'warning',
  st: ['warning', 'Aberta'],
  val: '15/06/2026'
}, {
  num: 'COT-2026-0459',
  cli: 'AgroSul Cooperativa',
  rota: 'Cascavel/PR → Paranaguá/PR',
  mod: 'FCL',
  valor: 'R$ 5.120,00',
  margem: '28,4%',
  mcls: 'success',
  st: ['info', 'Aprovada'],
  val: '14/06/2026'
}, {
  num: 'COT-2026-0458',
  cli: 'Comercial Litoral Norte',
  rota: 'Santos/SP → Campinas/SP',
  mod: 'LCL',
  valor: 'R$ 1.980,00',
  margem: '8,2%',
  mcls: 'error',
  st: ['secondary', 'Rascunho'],
  val: '—'
}, {
  num: 'COT-2026-0457',
  cli: 'Metalúrgica Horizonte',
  rota: 'Joinville/SC → Itajaí/SC',
  mod: 'FCL',
  valor: 'R$ 3.450,00',
  margem: '19,0%',
  mcls: 'warning',
  st: ['error', 'Rejeitada'],
  val: '10/06/2026'
}, {
  num: 'COT-2026-0456',
  cli: 'Distribuidora Pampa S.A.',
  rota: 'Porto Alegre/RS → Caxias do Sul/RS',
  mod: 'LCL',
  valor: 'R$ 2.310,00',
  margem: '22,5%',
  mcls: 'warning',
  st: ['secondary', 'Expirada'],
  val: '05/06/2026'
}];
function row(q) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar">${ico('doc', 'ic5')}</span><div style="min-width:0"><div class="name" style="font-family:'JetBrains Mono',monospace;font-size:13px">${q.num}</div><div class="doc" style="font-family:inherit">${q.cli}</div></div></div></td>
    <td><span class="cell-locality">${ico('pin', 'ic4')}${q.rota}</span></td>
    <td><span class="badge secondary">${q.mod}</span></td>
    <td class="cell-num">${q.valor}</td>
    <td><span class="badge ${q.mcls}">${q.margem}</span></td>
    <td><span class="badge ${q.st[0]}">${q.st[1]}</span></td>
    <td class="cell-date">${q.val}</td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="Cotações">
  <div class="page-head">
    <div class="ph-icon">${ico('doc', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Vendas <span>›</span> Cotações</p>
      <h1 class="ph-title">Cotações</h1>
      <p class="ph-desc">Propostas de frete com imposto, custo e margem item a item. Acompanhe status e converta em embarque.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Nova cotação</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por número, cliente ou rota..." /></div>
    <button class="btn btn-soft">Buscar</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros</button>
    <button class="btn btn-outline">${ico('download', 'ic4')} Exportar</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> de <strong>87</strong> cotações</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Cotação')}</th>
          <th>Rota</th>
          <th>Modal.</th>
          <th>${sortable('Valor')}</th>
          <th>${sortable('Margem')}</th>
          <th>${sortable('Status')}</th>
          <th>${sortable('Validade')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${QUOTES.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option></select></div>
      <div class="pg-nav"><button class="pg-btn" disabled>‹</button><button class="pg-btn active">1</button><button class="pg-btn">2</button><button class="pg-btn">3</button><button class="pg-btn">4</button><button class="pg-btn">›</button></div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Cotações',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "logistics-quotes-list.js", error: String((e && e.message) || e) }); }

// logos.jsx
try { (() => {
/* global React */
const {
  useState
} = React;
const C = {
  dark: '#16181d',
  orange: '#FF5A1F',
  orangeBright: '#FF6A33',
  light: '#fafaf9',
  panelLight: '#ffffff',
  panelDark: '#16181d',
  hair: 'rgba(22,24,29,0.10)'
};

/* A single "HiperTMS" wordmark — no space, two-tone. */
function Wordmark({
  font,
  weightA,
  weightB,
  size,
  ls = '-0.02em',
  kern = '-0.05em',
  inverted = false
}) {
  const darkColor = inverted ? C.light : C.dark;
  const orangeColor = inverted ? C.orangeBright : C.orange;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: font,
      fontSize: size,
      lineHeight: 1,
      letterSpacing: ls,
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: darkColor,
      fontWeight: weightA
    }
  }, "Hiper"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: orangeColor,
      fontWeight: weightB,
      marginLeft: kern
    }
  }, "TMS"));
}

/* One presentation artboard for a direction. */
function LogoBoard({
  cfg
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: C.light
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '1 1 auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 32px',
      background: C.panelLight
    }
  }, /*#__PURE__*/React.createElement(Wordmark, {
    font: cfg.font,
    weightA: cfg.wA,
    weightB: cfg.wB,
    size: cfg.heroSize,
    ls: cfg.ls,
    kern: cfg.kern
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      borderTop: `1px solid ${C.hair}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '28px 20px',
      background: C.panelDark
    }
  }, /*#__PURE__*/React.createElement(Wordmark, {
    font: cfg.font,
    weightA: cfg.wA,
    weightB: cfg.wB,
    size: cfg.midSize,
    ls: cfg.ls,
    kern: cfg.kern,
    inverted: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '28px 20px',
      background: C.light,
      borderLeft: `1px solid ${C.hair}`
    }
  }, /*#__PURE__*/React.createElement(Wordmark, {
    font: cfg.font,
    weightA: cfg.wA,
    weightB: cfg.wB,
    size: cfg.smallSize,
    ls: cfg.ls,
    kern: cfg.kern
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 12,
      padding: '14px 22px 16px',
      borderTop: `1px solid ${C.hair}`,
      background: C.light,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: C.dark,
      letterSpacing: '0.02em'
    }
  }, cfg.title), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'rgba(22,24,29,0.5)'
    }
  }, cfg.note)));
}
const DIRECTIONS = [{
  id: 'a',
  label: 'A · Poppins',
  title: cfgTitle('A'),
  font: "'Poppins', sans-serif",
  wA: 600,
  wB: 700,
  ls: '-0.02em',
  kern: '-0.12em',
  note: 'geométrica · profissional',
  heroSize: 58,
  midSize: 34,
  smallSize: 23
}, {
  id: 'b',
  label: 'B · Baloo 2',
  title: cfgTitle('B'),
  font: "'Baloo 2', sans-serif",
  wA: 600,
  wB: 800,
  ls: '-0.03em',
  kern: '-0.04em',
  note: 'gordinha · muito arredondada',
  heroSize: 56,
  midSize: 33,
  smallSize: 22
}, {
  id: 'c',
  label: 'C · Nunito',
  title: cfgTitle('C'),
  font: "'Nunito', sans-serif",
  wA: 700,
  wB: 800,
  ls: '-0.02em',
  kern: '-0.055em',
  note: 'terminais redondos · amigável',
  heroSize: 58,
  midSize: 34,
  smallSize: 23
}, {
  id: 'd',
  label: 'D · Lexend',
  title: cfgTitle('D'),
  font: "'Lexend', sans-serif",
  wA: 600,
  wB: 700,
  ls: '-0.03em',
  kern: '-0.12em',
  note: 'moderna · legível · suave',
  heroSize: 56,
  midSize: 33,
  smallSize: 22
}];
function cfgTitle(letter) {
  return 'Direção ' + letter;
}
function App() {
  return /*#__PURE__*/React.createElement(DesignCanvas, null, /*#__PURE__*/React.createElement(DCSection, {
    id: "wordmark",
    title: "Wordmark HiperTMS",
    subtitle: "Uma palavra \xB7 bicolor escuro + laranja \xB7 amig\xE1vel e arredondado"
  }, DIRECTIONS.map(cfg => /*#__PURE__*/React.createElement(DCArtboard, {
    key: cfg.id,
    id: cfg.id,
    label: cfg.label,
    width: 620,
    height: 420
  }, /*#__PURE__*/React.createElement(LogoBoard, {
    cfg: cfg
  })))));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "logos.jsx", error: String((e && e.message) || e) }); }

// platform-tenants-list.js
try { (() => {
/* global window */
// Platform-admin · Tenants — list page on the shared shell. `ico` is global.

const TENANTS = [{
  nome: 'Transportadora Modelo LTDA',
  cnpj: '11.222.333/0001-44',
  plano: 'Essencial',
  users: '5 / 5',
  docs: '842 / 1.000',
  mrr: 'R$ 299,00',
  st: ['success', 'Ativo'],
  desde: '01/2025'
}, {
  nome: 'Rodoviário Brasil Express',
  cnpj: '22.333.444/0001-55',
  plano: 'Profissional',
  users: '12 / 15',
  docs: '3.210 / 5.000',
  mrr: 'R$ 599,00',
  st: ['success', 'Ativo'],
  desde: '08/2024'
}, {
  nome: 'LogPar Transportes',
  cnpj: '33.444.555/0001-66',
  plano: 'Básico',
  users: '1 / 1',
  docs: '120 / 500',
  mrr: 'R$ 89,00',
  st: ['warning', 'Trial'],
  desde: '05/2026'
}, {
  nome: 'Cargas do Vale ME',
  cnpj: '44.555.666/0001-77',
  plano: 'Essencial',
  users: '4 / 5',
  docs: '980 / 1.000',
  mrr: 'R$ 299,00',
  st: ['error', 'Inadimplente'],
  desde: '02/2025'
}, {
  nome: 'Translitoral S.A.',
  cnpj: '55.666.777/0001-88',
  plano: 'Profissional',
  users: '9 / 15',
  docs: '2.140 / 5.000',
  mrr: 'R$ 599,00',
  st: ['success', 'Ativo'],
  desde: '11/2024'
}, {
  nome: 'Expresso Norte-Sul',
  cnpj: '66.777.888/0001-99',
  plano: 'Básico',
  users: '1 / 1',
  docs: '60 / 500',
  mrr: 'R$ 0,00',
  st: ['secondary', 'Cancelado'],
  desde: '03/2026'
}];
function row(t) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar" style="background:#dcfce7;color:#166534">${ico('store', 'ic5')}</span><div style="min-width:0"><div class="name">${t.nome}</div><div class="doc">${t.cnpj}</div></div></div></td>
    <td><span class="badge info">${t.plano}</span></td>
    <td class="cell-num">${t.users}</td>
    <td class="cell-num">${t.docs}</td>
    <td class="cell-num">${t.mrr}</td>
    <td><span class="badge ${t.st[0]}">${t.st[1]}</span></td>
    <td class="cell-date">${t.desde}</td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
function kpi(label, value, sub, cls) {
  return `<div class="kpi-card"><p class="kpi-label">${label}</p><p class="kpi-value">${value}</p><p class="kpi-sub ${cls || ''}">${sub}</p></div>`;
}
const content = `
<div class="page" data-screen-label="Tenants">
  <div class="page-head">
    <div class="ph-icon">${ico('chart', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Administração <span>›</span> Tenants</p>
      <h1 class="ph-title">Tenants</h1>
      <p class="ph-desc">Empresas assinantes da plataforma: plano, consumo, faturamento recorrente e situação da assinatura.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Novo tenant</button>
  </div>

  <div class="kpi-row">
    ${kpi('MRR total', 'R$ 184.7k', '▲ 6,2% vs. mês anterior', 'pos')}
    ${kpi('Tenants ativos', '312', '▲ 14 novos no mês', 'pos')}
    ${kpi('Trials abertos', '28', '9 expiram em 7 dias', 'warn')}
    ${kpi('Inadimplência', '4,1%', '▲ 0,3 p.p.', 'neg')}
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por razão social ou CNPJ..." /></div>
    <button class="btn btn-soft">Buscar</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros</button>
    <button class="btn btn-outline">${ico('download', 'ic4')} Exportar</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> de <strong>312</strong> tenants</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Tenant')}</th>
          <th>Plano</th>
          <th>${sortable('Usuários')}</th>
          <th>${sortable('Documentos')}</th>
          <th>${sortable('MRR')}</th>
          <th>${sortable('Status')}</th>
          <th>${sortable('Cliente desde')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${TENANTS.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option><option>100</option></select></div>
      <div class="pg-nav"><button class="pg-btn" disabled>‹</button><button class="pg-btn active">1</button><button class="pg-btn">2</button><button class="pg-btn">3</button><span class="pg-info">…</span><button class="pg-btn">52</button><button class="pg-btn">›</button></div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Administração',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "platform-tenants-list.js", error: String((e && e.message) || e) }); }

// pricing-tables-list.js
try { (() => {
/* global window */
// Precificação · Tabelas de Preço — list page on the shared shell. `ico` is global.

const TABLES = [{
  nome: 'Tabela Nacional Modelo',
  regime: 'Lucro Presumido',
  abrang: 'Nacional · todas as rotas',
  margem: '28%',
  vig: '01/01/2026 – 31/12/2026',
  st: ['success', 'Vigente']
}, {
  nome: 'Sudeste — Carga Geral',
  regime: 'Simples Nacional',
  abrang: 'SP, RJ, MG, ES',
  margem: '24%',
  vig: '01/03/2026 – 28/02/2027',
  st: ['success', 'Vigente']
}, {
  nome: 'Sul — Granel',
  regime: 'Lucro Real',
  abrang: 'PR, SC, RS',
  margem: '31%',
  vig: '01/06/2026 – 31/05/2027',
  st: ['success', 'Vigente']
}, {
  nome: 'Cliente: Indústria Vale Verde',
  regime: 'Lucro Presumido',
  abrang: 'Contrato dedicado',
  margem: '18%',
  vig: '15/06/2026 – 14/06/2027',
  st: ['warning', 'Aguardando aprovação']
}, {
  nome: 'Centro-Oeste — Agro',
  regime: 'Lucro Presumido',
  abrang: 'GO, MT, MS, DF',
  margem: '26%',
  vig: '01/02/2026 – 31/07/2026',
  st: ['info', 'Em revisão']
}, {
  nome: 'Tabela Nacional 2025',
  regime: 'Lucro Presumido',
  abrang: 'Nacional · todas as rotas',
  margem: '27%',
  vig: '01/01/2025 – 31/12/2025',
  st: ['secondary', 'Encerrada']
}];
function row(t) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar" style="background:#ede9fe;color:#6d28d9">${ico('layers', 'ic5')}</span><div style="min-width:0"><div class="name">${t.nome}</div><div class="doc" style="font-family:inherit">${t.abrang}</div></div></div></td>
    <td><span class="badge secondary">${t.regime}</span></td>
    <td><span class="badge success">${t.margem}</span></td>
    <td class="cell-date">${t.vig}</td>
    <td><span class="badge ${t.st[0]}">${t.st[1]}</span></td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="Tabelas de Preço">
  <div class="page-head">
    <div class="ph-icon">${ico('layers', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Precificação <span>›</span> Tabelas de Preço</p>
      <h1 class="ph-title">Tabelas de Preço</h1>
      <p class="ph-desc">Tabelas e regras de precificação por abrangência, regime tributário e margem-alvo. Base de todas as cotações.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Nova tabela</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por nome, abrangência ou regime..." /></div>
    <button class="btn btn-soft">Buscar</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros</button>
    <button class="btn btn-outline">${ico('download', 'ic4')} Exportar</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> de <strong>14</strong> tabelas</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Tabela')}</th>
          <th>Regime tributário</th>
          <th>${sortable('Margem-alvo')}</th>
          <th>${sortable('Vigência')}</th>
          <th>${sortable('Status')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${TABLES.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option></select></div>
      <div class="pg-nav"><button class="pg-btn" disabled>‹</button><button class="pg-btn active">1</button><button class="pg-btn">›</button></div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Precificação',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "pricing-tables-list.js", error: String((e && e.message) || e) }); }

// procurement-orders-list.js
try { (() => {
/* global window */
// Compras · Pedidos de Compra — list page on the shared shell. `ico` is global.

const ORDERS = [{
  num: 'PC-2026-0188',
  forn: 'Posto Rede Sul LTDA',
  cat: 'Combustível',
  itens: '1 item',
  valor: 'R$ 18.400,00',
  entrega: '12/06/2026',
  st: ['success', 'Recebido']
}, {
  num: 'PC-2026-0187',
  forn: 'Oficina Central Diesel',
  cat: 'Manutenção',
  itens: '4 itens',
  valor: 'R$ 6.250,00',
  entrega: '14/06/2026',
  st: ['warning', 'Aguardando entrega']
}, {
  num: 'PC-2026-0186',
  forn: 'Pneus & Cia',
  cat: 'Pneus',
  itens: '8 itens',
  valor: 'R$ 22.880,00',
  entrega: '18/06/2026',
  st: ['info', 'Aprovado']
}, {
  num: 'PC-2026-0185',
  forn: 'Distribuidora de Peças MG',
  cat: 'Peças',
  itens: '12 itens',
  valor: 'R$ 4.120,50',
  entrega: '—',
  st: ['secondary', 'Em cotação']
}, {
  num: 'PC-2026-0184',
  forn: 'Lubrificantes Brasil',
  cat: 'Lubrificantes',
  itens: '3 itens',
  valor: 'R$ 2.940,00',
  entrega: '10/06/2026',
  st: ['error', 'Cancelado']
}, {
  num: 'PC-2026-0183',
  forn: 'TI Soluções Corporativas',
  cat: 'Serviços',
  itens: '1 item',
  valor: 'R$ 1.500,00',
  entrega: '09/06/2026',
  st: ['success', 'Recebido']
}];
function row(o) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar" style="background:#e0f2fe;color:#075985">${ico('cart', 'ic5')}</span><div style="min-width:0"><div class="name" style="font-family:'JetBrains Mono',monospace;font-size:13px">${o.num}</div><div class="doc" style="font-family:inherit">${o.forn}</div></div></div></td>
    <td><span class="badge secondary">${o.cat}</span></td>
    <td><span class="cell-num" style="color:var(--fg-muted)">${o.itens}</span></td>
    <td class="cell-num">${o.valor}</td>
    <td class="cell-date">${o.entrega}</td>
    <td><span class="badge ${o.st[0]}">${o.st[1]}</span></td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="Pedidos de Compra">
  <div class="page-head">
    <div class="ph-icon">${ico('cart', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Compras <span>›</span> Pedidos</p>
      <h1 class="ph-title">Pedidos de Compra</h1>
      <p class="ph-desc">Aquisições de combustível, peças, pneus e serviços. Do pedido ao recebimento, integrando estoque e financeiro.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Novo pedido</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por número, fornecedor ou categoria..." /></div>
    <button class="btn btn-soft">Buscar</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros</button>
    <button class="btn btn-outline">${ico('download', 'ic4')} Exportar</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> de <strong>41</strong> pedidos</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Pedido')}</th>
          <th>Categoria</th>
          <th>Itens</th>
          <th>${sortable('Valor')}</th>
          <th>${sortable('Entrega')}</th>
          <th>${sortable('Status')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${ORDERS.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option></select></div>
      <div class="pg-nav"><button class="pg-btn" disabled>‹</button><button class="pg-btn active">1</button><button class="pg-btn">2</button><button class="pg-btn">›</button></div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Compras',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "procurement-orders-list.js", error: String((e && e.message) || e) }); }

// slides/deck-stage.js
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)
/* BEGIN USAGE */
/**
 * <deck-stage> — reusable web component for HTML decks.
 *
 * Handles:
 *  (a) speaker notes — reads <script type="application/json" id="speaker-notes">
 *      and posts {slideIndexChanged: N} to the parent window on nav.
 *  (b) keyboard navigation — ←/→, PgUp/PgDn, Space, Home/End, number keys.
 *      On touch devices, tapping the left/right half of the stage goes
 *      prev/next — taps on links, buttons and other interactive slide
 *      content are left alone.
 *  (c) press R to reset to slide 0 (with a tasteful keyboard hint).
 *  (d) bottom-center overlay showing slide count + hints, fades out on idle.
 *  (e) auto-scaling — inner canvas is a fixed design size (default 1920×1080)
 *      scaled with `transform: scale()` to fit the viewport, letterboxed.
 *      Set the `noscale` attribute to render at authored size (1:1) — the
 *      PPTX exporter sets this so its DOM capture sees unscaled geometry.
 *  (f) print — `@media print` lays every slide out as its own page at the
 *      design size, so the browser's Print → Save as PDF produces a clean
 *      one-page-per-slide PDF with no extra setup.
 *  (g) thumbnail rail — resizable left-hand column of per-slide thumbnails
 *      (static clones). Click to navigate; ↑/↓ with a thumbnail focused to
 *      step between slides; drag to reorder; right-click for
 *      Skip / Move up / Move down / Duplicate / Delete (Delete opens a
 *      Cancel/Delete confirm dialog). Drag the rail's right edge to resize;
 *      width persists to
 *      localStorage. Skipped slides carry `data-deck-skip`, are dimmed in
 *      the rail, omitted from prev/next navigation, and hidden at print.
 *      The rail is suppressed in presenting mode, in the host's Preview
 *      mode (ViewerMode='none'), on `noscale`, on narrow viewports
 *      (≤640px), and via the `no-rail` attribute. Rail mutations dispatch
 *      a `deckchange`
 *      CustomEvent on the element: detail = {action, from, to, slide}.
 *
 * Slides are HIDDEN, not unmounted. Non-active slides stay in the DOM with
 * `visibility: hidden` + `opacity: 0`, so their state (videos, iframes,
 * form inputs, React trees) is preserved across navigation.
 *
 * Lifecycle event — the component dispatches a `slidechange` CustomEvent on
 * itself whenever the active slide changes (including the initial mount).
 * The event bubbles and composes out of shadow DOM, so you can listen on
 * the <deck-stage> element or on document:
 *
 *   document.querySelector('deck-stage').addEventListener('slidechange', (e) => {
 *     e.detail.index         // new 0-based index
 *     e.detail.previousIndex // previous index, or -1 on init
 *     e.detail.total         // total slide count
 *     e.detail.slide         // the new active slide element
 *     e.detail.previousSlide // the prior slide element, or null on init
 *     e.detail.reason        // 'init' | 'keyboard' | 'click' | 'tap' | 'api'
 *   });
 *
 * Persistence: none at the deck level. The host app keeps the current slide
 * in its own URL (?slide=) and re-delivers it via location.hash on load, so a
 * bare load with no hash always starts at slide 1.
 *
 * Usage:
 *   <style>deck-stage:not(:defined){visibility:hidden}</style>
 *   <deck-stage width="1920" height="1080">
 *     <section data-label="Title">...</section>
 *     <section data-label="Agenda">...</section>
 *   </deck-stage>
 *   <script src="deck-stage.js"></script>
 *
 * The :not(:defined) rule prevents a flash of the first slide at its
 * authored styles before this script runs and attaches the shadow root.
 *
 * Slides are the direct element children of <deck-stage>. Each slide is
 * automatically tagged with:
 *   - data-screen-label="NN Label"   (1-indexed, for comment flow)
 *   - data-om-validate="no_overflowing_text,no_overlapping_text,slide_sized_text"
 *
 * Speaker notes stay in sync because the component posts {slideIndexChanged: N}
 * to the parent — just include the #speaker-notes script tag if asked for notes.
 *
 * Authoring guidance:
 *   - Write slide bodies as static HTML inside <deck-stage>, with sizing via
 *     CSS custom properties in a <style> block rather than JS constants.
 *     Static slide markup is what lets the user click a heading in edit mode
 *     and retype it directly; a slide rendered through <script type="text/babel">,
 *     React, or a loop over a JS array has to round-trip every tweak through a
 *     chat message instead. Reach for script-generated slides only when the
 *     content genuinely needs interactive behaviour static HTML can't express.
 *   - Do NOT set position/inset/width/height on the slide <section> elements —
 *     the component absolutely positions every slotted child for you.
 *   - Entrance animations: make the visible end-state the base style and
 *     animate *from* hidden, so print and reduced-motion show content.
 *     Gate the animation on [data-deck-active] and the motion query, e.g.
 *     `@media (prefers-reduced-motion:no-preference){ [data-deck-active] .x{animation:fade-in .5s both} }`.
 *     Avoid infinite decorative loops on slide content.
 */
/* END USAGE */

(() => {
  const DESIGN_W_DEFAULT = 1920;
  const DESIGN_H_DEFAULT = 1080;
  const OVERLAY_HIDE_MS = 1800;
  const VALIDATE_ATTR = 'no_overflowing_text,no_overlapping_text,slide_sized_text';
  const FINE_POINTER_MQ = matchMedia('(hover: hover) and (pointer: fine)');
  const NARROW_MQ = matchMedia('(max-width: 640px)');
  // Slide-authored controls that should keep a tap instead of it navigating.
  const INTERACTIVE_SEL = 'a[href], button, input, select, textarea, summary, label, video[controls], audio[controls], [role="button"], [onclick], [tabindex]:not([tabindex^="-"]), [contenteditable]:not([contenteditable="false" i])';
  const pad2 = n => String(n).padStart(2, '0');

  // Label precedence: data-label → data-screen-label (number stripped) → first heading → "Slide".
  const getSlideLabel = el => {
    const explicit = el.getAttribute('data-label');
    if (explicit) return explicit;
    const existing = el.getAttribute('data-screen-label');
    if (existing) return existing.replace(/^\s*\d+\s*/, '').trim() || existing;
    const h = el.querySelector('h1, h2, h3, [data-title]');
    const t = h && (h.textContent || '').trim().slice(0, 40);
    if (t) return t;
    return 'Slide';
  };
  const stylesheet = `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      background: #000;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
      overflow: hidden;
      -webkit-tap-highlight-color: transparent;
    }
    /* connectedCallback holds this until document.fonts.ready (capped 2s) so
     * the first visible paint has the deck's real typography + final rail
     * layout. opacity (not visibility) so the active slide can't un-hide
     * itself via the ::slotted([data-deck-active]) visibility:visible rule.
     * Only the stage/rail hide — the black :host background stays, so the
     * iframe doesn't flash the page's default white. */
    :host([data-fonts-pending]) .stage,
    :host([data-fonts-pending]) .rail { opacity: 0; pointer-events: none; }

    .stage {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .canvas {
      position: relative;
      transform-origin: center center;
      flex-shrink: 0;
      background: #fff;
      will-change: transform;
    }

    /* Slides live in light DOM (via <slot>) so authored CSS still applies.
       We absolutely position each slotted child to stack them. */
    ::slotted(*) {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      box-sizing: border-box !important;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
    }
    ::slotted([data-deck-active]) {
      opacity: 1;
      pointer-events: auto;
      visibility: visible;
    }

    .overlay {
      position: fixed;
      left: 50%;
      bottom: 22px;
      transform: translate(-50%, 6px) scale(0.92);
      filter: blur(6px);
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      background: #000;
      color: #fff;
      border-radius: 999px;
      font-size: 12px;
      font-feature-settings: "tnum" 1;
      letter-spacing: 0.01em;
      opacity: 0;
      pointer-events: none;
      transition: opacity 260ms ease, transform 260ms cubic-bezier(.2,.8,.2,1), filter 260ms ease;
      transform-origin: center bottom;
      z-index: 2147483000;
      user-select: none;
    }
    .overlay[data-visible] {
      opacity: 1;
      pointer-events: auto;
      transform: translate(-50%, 0) scale(1);
      filter: blur(0);
    }

    .btn {
      appearance: none;
      -webkit-appearance: none;
      background: transparent;
      border: 0;
      margin: 0;
      padding: 0;
      color: inherit;
      font: inherit;
      cursor: default;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      min-width: 28px;
      border-radius: 999px;
      color: rgba(255,255,255,0.72);
      transition: background 140ms ease, color 140ms ease;
      -webkit-tap-highlight-color: transparent;
    }
    .btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
    .btn:active { background: rgba(255,255,255,0.18); }
    .btn:focus { outline: none; }
    .btn:focus-visible { outline: none; }
    .btn::-moz-focus-inner { border: 0; }
    .btn svg { width: 14px; height: 14px; display: block; }
    .btn.reset {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.02em;
      padding: 0 10px 0 12px;
      gap: 6px;
      color: rgba(255,255,255,0.72);
    }
    .btn.reset .kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      font-size: 10px;
      line-height: 1;
      color: rgba(255,255,255,0.88);
      background: rgba(255,255,255,0.12);
      border-radius: 4px;
    }

    .count {
      font-variant-numeric: tabular-nums;
      color: #fff;
      font-weight: 500;
      padding: 0 8px;
      min-width: 42px;
      text-align: center;
      font-size: 12px;
    }
    .count .sep { color: rgba(255,255,255,0.45); margin: 0 3px; font-weight: 400; }
    .count .total { color: rgba(255,255,255,0.55); }

    .divider {
      width: 1px;
      height: 14px;
      background: rgba(255,255,255,0.18);
      margin: 0 2px;
    }

    /* ── Thumbnail rail ──────────────────────────────────────────────────
       Fixed column on the left; each thumbnail is a static deep-clone of
       the light-DOM slide scaled into a 16:9 (or design-aspect) frame. The
       stage re-fits around it (see _fit); hidden during present / noscale
       / print so capture geometry and fullscreen output are unchanged. */
    .rail {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: var(--deck-rail-w, 188px);
      background: #141414;
      border-right: 1px solid rgba(255,255,255,0.08);
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px 10px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 12px;
      z-index: 2147482500;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.18) transparent;
    }
    .rail::-webkit-scrollbar { width: 8px; }
    .rail::-webkit-scrollbar-track { background: transparent; margin: 2px; }
    .rail::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.18);
      border-radius: 4px;
      border: 2px solid transparent;
      background-clip: content-box;
    }
    .rail::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.28);
      border: 2px solid transparent;
      background-clip: content-box;
    }
    :host([no-rail]) .rail,
    :host([noscale]) .rail { display: none; }
    .rail[data-presenting] { display: none; }
    @media (max-width: 640px) {
      .rail, .rail-resize { display: none; }
    }
    /* User-driven show/hide (the TweaksPanel toggle) slides instead of
       popping. Transitions are gated on :host([data-rail-anim]) — set only
       for the 200ms around the toggle — so window-resize and rail-width
       drag (which also call _fit) don't lag behind the cursor. */
    .rail[data-user-hidden] { transform: translateX(-100%); }
    :host([data-rail-anim]) .rail { transition: transform 200ms cubic-bezier(.3,.7,.4,1); }
    :host([data-rail-anim]) .stage { transition: left 200ms cubic-bezier(.3,.7,.4,1); }
    :host([data-rail-anim]) .canvas { transition: transform 200ms cubic-bezier(.3,.7,.4,1); }
    /* transition shorthand replaces rather than merges — repeat the base
       .overlay opacity/transform/filter transitions so visibility changes
       during the 200ms toggle window still fade instead of popping. */
    :host([data-rail-anim]) .overlay {
      transition: margin-left 200ms cubic-bezier(.3,.7,.4,1),
                  opacity 260ms ease,
                  transform 260ms cubic-bezier(.2,.8,.2,1),
                  filter 260ms ease;
    }

    .thumb {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }
    .thumb .num {
      width: 16px;
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 500;
      text-align: right;
      color: rgba(255,255,255,0.55);
      padding-top: 2px;
      font-variant-numeric: tabular-nums;
    }
    .thumb .frame {
      position: relative;
      flex: 1;
      min-width: 0;
      aspect-ratio: var(--deck-aspect);
      background: #fff;
      border-radius: 4px;
      outline: 2px solid transparent;
      outline-offset: 0;
      overflow: hidden;
      transition: outline-color 120ms ease;
    }
    .thumb:hover .frame { outline-color: rgba(255,255,255,0.25); }
    .thumb { outline: none; }
    .thumb:focus-visible .frame { outline-color: rgba(255,255,255,0.5); }
    .thumb[data-current] .num { color: #fff; }
    .thumb[data-current] .frame { outline-color: #D97757; }
    .thumb[data-dragging] { opacity: 0.35; }
    .thumb::before {
      content: '';
      position: absolute;
      left: 24px;
      right: 0;
      height: 3px;
      border-radius: 2px;
      background: #D97757;
      opacity: 0;
      pointer-events: none;
    }
    .thumb[data-drop="before"]::before { top: -8px; opacity: 1; }
    .thumb[data-drop="after"]::before { bottom: -8px; opacity: 1; }
    .thumb[data-skip] .frame { opacity: 0.35; }
    .thumb[data-skip] .frame::after {
      content: 'Skipped';
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.45);
      color: #fff;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.04em;
    }

    .ctxmenu {
      position: fixed;
      min-width: 150px;
      padding: 4px;
      background: #242424;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 7px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      z-index: 2147483100;
      display: none;
      font-size: 12px;
    }
    .ctxmenu[data-open] { display: block; }
    .ctxmenu button {
      display: block;
      width: 100%;
      appearance: none;
      border: 0;
      background: transparent;
      color: #e8e8e8;
      font: inherit;
      text-align: left;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    .ctxmenu button:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
    .ctxmenu button:disabled { opacity: 0.35; cursor: default; }
    .ctxmenu hr {
      border: 0;
      border-top: 1px solid rgba(255,255,255,0.1);
      margin: 4px 2px;
    }

    .rail-resize {
      position: fixed;
      left: calc(var(--deck-rail-w, 188px) - 3px);
      top: 0;
      bottom: 0;
      width: 6px;
      cursor: col-resize;
      z-index: 2147482600;
      touch-action: none;
    }
    .rail-resize:hover,
    .rail-resize[data-dragging] { background: rgba(255,255,255,0.12); }
    :host([no-rail]) .rail-resize,
    :host([noscale]) .rail-resize,
    .rail[data-presenting] + .rail-resize,
    .rail[data-user-hidden] + .rail-resize { display: none; }

    /* Delete-confirm popup — matches the SPA's ConfirmDialog layout
       (title + message body, depressed footer with Cancel / Delete). */
    .confirm-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 2147483200;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .confirm-backdrop[data-open] { display: flex; }
    .confirm {
      width: 320px;
      max-width: calc(100vw - 32px);
      background: #2a2a2a;
      color: #e8e8e8;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
      overflow: hidden;
      font-family: inherit;
      animation: deck-confirm-in 0.18s ease;
    }
    @keyframes deck-confirm-in {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    .confirm .body { padding: 20px 20px 16px; }
    .confirm .title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
    .confirm .msg { font-size: 13px; line-height: 1.5; color: rgba(255,255,255,0.65); }
    .confirm .footer {
      padding: 14px 20px;
      background: #1f1f1f;
      border-top: 1px solid rgba(255,255,255,0.08);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .confirm button {
      appearance: none;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
    }
    .confirm .cancel {
      background: transparent;
      border: 0;
      color: rgba(255,255,255,0.8);
    }
    .confirm .cancel:hover { background: rgba(255,255,255,0.08); }
    .confirm .danger {
      background: #c96442;
      border: 1px solid rgba(0,0,0,0.15);
      color: #fff;
      box-shadow: 0 1px 3px rgba(166,50,68,0.3), 0 2px 6px rgba(166,50,68,0.18);
    }
    .confirm .danger:hover { background: #b5563a; }

    /* ── Print: one page per slide, no chrome ────────────────────────────
       The screen layout stacks every slide at inset:0 inside a scaled
       canvas; for print we want them in document flow at the authored
       design size so the browser paginates one slide per sheet. The
       @page size is set from the width/height attributes via the inline
       <style id="deck-stage-print-page"> that connectedCallback injects
       into <head> (the @page at-rule has no effect inside shadow DOM). */
    @media print {
      :host {
        position: static;
        inset: auto;
        background: none;
        overflow: visible;
        color: inherit;
      }
      .stage { position: static; display: block; }
      .canvas {
        transform: none !important;
        width: auto !important;
        height: auto !important;
        background: none;
        will-change: auto;
      }
      ::slotted(*) {
        position: relative !important;
        inset: auto !important;
        width: var(--deck-design-w) !important;
        height: var(--deck-design-h) !important;
        box-sizing: border-box !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto;
        break-after: page;
        page-break-after: always;
        break-inside: avoid;
        overflow: hidden;
      }
      /* :last-child alone isn't enough once data-deck-skip hides the
         trailing slide(s) — the last *visible* slide still carries
         break-after:page and prints a blank sheet. _markLastVisible()
         maintains data-deck-last-visible on the last non-skipped slide. */
      ::slotted(*:last-child),
      ::slotted([data-deck-last-visible]) {
        break-after: auto;
        page-break-after: auto;
      }
      ::slotted([data-deck-skip]) { display: none !important; }
      .overlay, .rail, .rail-resize, .ctxmenu, .confirm-backdrop { display: none !important; }
    }
  `;
  class DeckStage extends HTMLElement {
    static get observedAttributes() {
      return ['width', 'height', 'noscale', 'no-rail'];
    }
    constructor() {
      super();
      this._root = this.attachShadow({
        mode: 'open'
      });
      this._index = 0;
      this._slides = [];
      this._notes = [];
      this._hideTimer = null;
      this._mouseIdleTimer = null;
      this._menuIndex = -1;
      this._onKey = this._onKey.bind(this);
      this._onResize = this._onResize.bind(this);
      this._onSlotChange = this._onSlotChange.bind(this);
      this._onMouseMove = this._onMouseMove.bind(this);
      this._onTap = this._onTap.bind(this);
      this._onMessage = this._onMessage.bind(this);
      // Capture-phase close so a click anywhere dismisses the menu, but
      // ignore clicks that land inside the menu itself — otherwise the
      // capture handler runs before the menu's own (bubble) handler and
      // clears _menuIndex out from under it.
      this._onDocClick = e => {
        if (this._menu && e.composedPath && e.composedPath().includes(this._menu)) return;
        this._closeMenu();
      };
    }
    get designWidth() {
      return parseInt(this.getAttribute('width'), 10) || DESIGN_W_DEFAULT;
    }
    get designHeight() {
      return parseInt(this.getAttribute('height'), 10) || DESIGN_H_DEFAULT;
    }
    connectedCallback() {
      // Presenter-view popup loads deckUrl?_snthumb=...#N for its prev/cur/
      // next thumbnails — the rail has no business rendering inside those
      // (wrong scale, and it offsets the stage so the thumb shows a gutter).
      if (/[?&]_snthumb=/.test(location.search)) this.setAttribute('no-rail', '');
      this._render();
      this._loadNotes();
      this._syncPrintPageRule();
      window.addEventListener('keydown', this._onKey);
      window.addEventListener('resize', this._onResize);
      window.addEventListener('mousemove', this._onMouseMove, {
        passive: true
      });
      window.addEventListener('message', this._onMessage);
      window.addEventListener('click', this._onDocClick, true);
      this.addEventListener('click', this._onTap);
      // Print lays every slide out as its own page, so [data-deck-active]-
      // gated entrance styles need the attribute on every slide (not just
      // the current one) or their content prints at the hidden base style.
      // The transient freeze style lands BEFORE the attributes so any
      // attribute-keyed transition fires at 0s (changing transition-
      // duration after a transition has started doesn't affect it).
      this._onBeforePrint = () => {
        if (this._freezeStyle) this._freezeStyle.remove();
        this._freezeStyle = document.createElement('style');
        this._freezeStyle.textContent = '*,*::before,*::after{transition-duration:0s !important}';
        document.head.appendChild(this._freezeStyle);
        this._slides.forEach(s => s.setAttribute('data-deck-active', ''));
      };
      this._onAfterPrint = () => {
        this._applyIndex({
          showOverlay: false,
          broadcast: false
        });
        if (this._freezeStyle) {
          this._freezeStyle.remove();
          this._freezeStyle = null;
        }
      };
      window.addEventListener('beforeprint', this._onBeforePrint);
      window.addEventListener('afterprint', this._onAfterPrint);
      // Initial collection + layout happens via slotchange, which fires on mount.
      this._enableRail();
      // Hold the stage hidden until webfonts are ready so the first visible
      // paint has the deck's real typography — the :not(:defined) guard in
      // the page HTML only covers custom-element upgrade, not font load.
      // Capped so a 404'd font URL can't blank the deck indefinitely.
      this.setAttribute('data-fonts-pending', '');
      const reveal = () => this.removeAttribute('data-fonts-pending');
      // rAF first: fonts.ready is a pre-resolved promise until layout has
      // resolved the slotted text's font-family and pushed a FontFace into
      // 'loading'. Reading it here in connectedCallback (parse-time) would
      // settle the race in a microtask before any font fetch starts.
      requestAnimationFrame(() => {
        Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 2000))]).then(reveal, reveal);
      });
    }
    _enableRail() {
      // Idempotent — older host builds still post __omelette_rail_enabled.
      // no-rail guard keeps the observers/stylesheet walk off the cheap path
      // for presenter-popup thumbnail iframes (up to 9 per view).
      if (this._railEnabled || this.hasAttribute('no-rail')) return;
      this._railEnabled = true;
      // Per-viewer preference — restored alongside rail width. Default on;
      // only a stored '0' (from the TweaksPanel toggle) hides it.
      this._railVisible = true;
      try {
        if (localStorage.getItem('deck-stage.railVisible') === '0') this._railVisible = false;
      } catch (e) {}
      // Live thumbnail updates: watch the light-DOM slides for content
      // edits and re-clone just the affected thumb(s), debounced. Ignore
      // the data-deck-* / data-screen-label / data-om-validate attributes
      // this component itself writes so nav and skip don't trigger
      // spurious refreshes.
      const OWN_ATTRS = /^data-(deck-|screen-label$|om-validate$)/;
      this._liveDirty = new Set();
      this._liveObserver = new MutationObserver(records => {
        for (const r of records) {
          if (r.type === 'attributes' && OWN_ATTRS.test(r.attributeName || '')) continue;
          let n = r.target;
          while (n && n.parentElement !== this) n = n.parentElement;
          if (n && this._slideSet && this._slideSet.has(n)) this._liveDirty.add(n);
        }
        if (this._liveDirty.size && !this._liveTimer) {
          this._liveTimer = setTimeout(() => {
            this._liveTimer = null;
            this._liveDirty.forEach(s => this._refreshThumb(s));
            this._liveDirty.clear();
          }, 200);
        }
      });
      this._liveObserver.observe(this, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true
      });
      // Lazy thumbnail materialization — clone the slide only when its
      // frame scrolls into (or near) the rail viewport. rootMargin gives
      // ~4 thumbs of pre-load so fast scrolling doesn't flash blanks.
      this._railObserver = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting && e.target.__deckThumb) {
            this._materialize(e.target.__deckThumb);
          }
        });
      }, {
        root: this._rail,
        rootMargin: '400px 0px'
      });
      // Tweaks typically change CSS vars / attrs OUTSIDE <deck-stage>
      // (on <html>, <body>, a wrapper div, or a <style> tag), which
      // _liveObserver can't see. Re-snapshot author CSS (constructable
      // sheet is shared by reference, so one replaceSync updates every
      // thumb shadow root) and re-sync each thumb host's attrs + custom
      // properties. In-slide DOM mutations are _liveObserver's job.
      // Debounced so slider drags don't thrash.
      this._onTweakChange = () => {
        clearTimeout(this._tweakTimer);
        this._tweakTimer = setTimeout(() => {
          this._snapshotAuthorCss();
          // One getComputedStyle for the whole batch — each
          // getPropertyValue read below reuses the same computed style
          // as long as nothing invalidates layout between thumbs.
          const cs = getComputedStyle(this);
          (this._thumbs || []).forEach(t => {
            if (t.host) this._syncThumbHostAttrs(t.host, cs);
          });
        }, 120);
      };
      window.addEventListener('tweakchange', this._onTweakChange);
      this._snapshotAuthorCss();
      // Build the rail now that it's enabled — slotchange already fired,
      // so _renderRail's early-return skipped the initial build.
      this._syncRailHidden();
      this._renderRail();
      this._fit();
    }

    /** Snapshot document stylesheets into a constructable sheet that each
     *  thumbnail's nested shadow root adopts — so author CSS styles the
     *  cloned slide content without touching this component's chrome.
     *  Cross-origin sheets throw on .cssRules — skip them. Re-callable:
     *  the existing constructable sheet is reused via replaceSync so every
     *  already-adopted shadow root picks up the fresh CSS without re-adopt. */
    _snapshotAuthorCss() {
      // :root in an adopted sheet inside a shadow root matches nothing
      // (only the document root qualifies), so author rules like
      // `:root[data-voice="modern"] .serif` never reach the clones.
      // Rewrite :root → :host and mirror <html>'s data-*/class/lang onto
      // each thumb host (see _syncThumbHostAttrs) so the same selectors
      // match inside the thumbnail's shadow tree.
      const authorCss = Array.from(document.styleSheets).map(sh => {
        try {
          return Array.from(sh.cssRules).map(r => r.cssText).join('\n');
        } catch (e) {
          return '';
        }
      }).join('\n')
      // The shadow host is featureless outside the functional :host(...)
      // form, so any compound on :root — [attr], .class, #id, :pseudo —
      // must become :host(<compound>) not :host<compound>. Same for the
      // html type selector (Tailwind class-strategy dark mode emits
      // html.dark; Pico uses html[data-theme]), which has nothing to
      // match inside the thumb's shadow tree.
      .replace(/:root((?:\[[^\]]*\]|[.#][-\w]+|:[-\w]+(?:\([^)]*\))?)+)/g, ':host($1)').replace(/:root\b/g, ':host').replace(/(^|[\s,>~+(}])html((?:\[[^\]]*\]|[.#][-\w]+|:[-\w]+(?:\([^)]*\))?)+)(?![-\w])/g, '$1:host($2)').replace(/(^|[\s,>~+(}])html(?![-\w])/g, '$1:host');
      // Every custom property the author references. _syncThumbHostAttrs
      // mirrors each one's *computed* value at <deck-stage> onto the
      // thumb host so the live value wins over the :host default above
      // regardless of which ancestor the tweak wrote to (<html>, <body>,
      // a wrapper div, or the deck-stage element itself all inherit
      // down to getComputedStyle(this)).
      this._authorVars = new Set(authorCss.match(/--[\w-]+/g) || []);
      try {
        if (!this._adoptedSheet) this._adoptedSheet = new CSSStyleSheet();
        this._adoptedSheet.replaceSync(authorCss);
      } catch (e) {
        this._adoptedSheet = null;
        this._authorCss = authorCss;
      }
    }
    _syncThumbHostAttrs(host, cs) {
      const de = document.documentElement;
      // setAttribute overwrites but can't delete — an attr removed from
      // <html> (toggleAttribute off, classList emptied) would linger on
      // the host and :host([data-*]) / :host(.foo) rules would keep
      // matching. Remove stale mirrored attrs first; iterate backward
      // because removeAttribute mutates the live NamedNodeMap.
      for (let i = host.attributes.length - 1; i >= 0; i--) {
        const n = host.attributes[i].name;
        if ((n.startsWith('data-') || n === 'class' || n === 'lang') && !de.hasAttribute(n)) {
          host.removeAttribute(n);
        }
      }
      for (const a of de.attributes) {
        if (a.name.startsWith('data-') || a.name === 'class' || a.name === 'lang') {
          host.setAttribute(a.name, a.value);
        }
      }
      // The :root→:host rewrite in _snapshotAuthorCss pins each custom
      // property to its stylesheet default on the thumb host, shadowing
      // the live value that would otherwise inherit. Tweaks can write the
      // live value on any ancestor — <html>, <body>, a wrapper div, the
      // deck-stage element — so read it as the *computed* value at
      // <deck-stage> (which sees the whole inheritance chain) rather than
      // trying to guess which element the author wrote to. Inline on the
      // host beats the :host{} rule. remove-stale covers vars dropped
      // from the stylesheet between snapshots.
      const vars = this._authorVars || new Set();
      for (let i = host.style.length - 1; i >= 0; i--) {
        const p = host.style[i];
        if (p.startsWith('--') && !vars.has(p)) host.style.removeProperty(p);
      }
      const live = cs || getComputedStyle(this);
      vars.forEach(p => {
        const v = live.getPropertyValue(p);
        if (v) host.style.setProperty(p, v.trim());else host.style.removeProperty(p);
      });
    }
    disconnectedCallback() {
      window.removeEventListener('keydown', this._onKey);
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('mousemove', this._onMouseMove);
      window.removeEventListener('message', this._onMessage);
      window.removeEventListener('click', this._onDocClick, true);
      window.removeEventListener('beforeprint', this._onBeforePrint);
      window.removeEventListener('afterprint', this._onAfterPrint);
      if (this._freezeStyle) {
        this._freezeStyle.remove();
        this._freezeStyle = null;
      }
      this.removeEventListener('click', this._onTap);
      if (this._hideTimer) clearTimeout(this._hideTimer);
      if (this._mouseIdleTimer) clearTimeout(this._mouseIdleTimer);
      if (this._liveTimer) clearTimeout(this._liveTimer);
      if (this._tweakTimer) clearTimeout(this._tweakTimer);
      if (this._railAnimTimer) clearTimeout(this._railAnimTimer);
      if (this._scaleRaf) cancelAnimationFrame(this._scaleRaf);
      if (this._liveObserver) this._liveObserver.disconnect();
      if (this._railObserver) this._railObserver.disconnect();
      if (this._onTweakChange) window.removeEventListener('tweakchange', this._onTweakChange);
    }
    attributeChangedCallback() {
      if (this._canvas) {
        this._canvas.style.width = this.designWidth + 'px';
        this._canvas.style.height = this.designHeight + 'px';
        this._canvas.style.setProperty('--deck-design-w', this.designWidth + 'px');
        this._canvas.style.setProperty('--deck-design-h', this.designHeight + 'px');
        if (this._rail) {
          this._rail.style.setProperty('--deck-aspect', this.designWidth + '/' + this.designHeight);
        }
        this._fit();
        this._scaleThumbs();
        this._syncPrintPageRule();
      }
    }
    _render() {
      const style = document.createElement('style');
      style.textContent = stylesheet;
      const stage = document.createElement('div');
      stage.className = 'stage';
      const canvas = document.createElement('div');
      canvas.className = 'canvas';
      canvas.style.width = this.designWidth + 'px';
      canvas.style.height = this.designHeight + 'px';
      canvas.style.setProperty('--deck-design-w', this.designWidth + 'px');
      canvas.style.setProperty('--deck-design-h', this.designHeight + 'px');
      const slot = document.createElement('slot');
      slot.addEventListener('slotchange', this._onSlotChange);
      canvas.appendChild(slot);
      stage.appendChild(canvas);

      // Overlay: compact, solid black, with clickable controls.
      const overlay = document.createElement('div');
      overlay.className = 'overlay export-hidden';
      overlay.setAttribute('role', 'toolbar');
      overlay.setAttribute('aria-label', 'Deck controls');
      overlay.setAttribute('data-omelette-chrome', '');
      overlay.innerHTML = `
        <button class="btn prev" type="button" aria-label="Previous slide" title="Previous (←)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>
        </button>
        <span class="count" aria-live="polite"><span class="current">1</span><span class="sep">/</span><span class="total">1</span></span>
        <button class="btn next" type="button" aria-label="Next slide" title="Next (→)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>
        </button>
        <span class="divider"></span>
        <button class="btn reset" type="button" aria-label="Reset to first slide" title="Reset (R)">Reset<span class="kbd">R</span></button>
      `;
      overlay.querySelector('.prev').addEventListener('click', () => this._advance(-1, 'click'));
      overlay.querySelector('.next').addEventListener('click', () => this._advance(1, 'click'));
      overlay.querySelector('.reset').addEventListener('click', () => this._go(0, 'click'));

      // Thumbnail rail + context menu. Thumbnails are populated in
      // _renderRail() after _collectSlides().
      const rail = document.createElement('div');
      rail.className = 'rail export-hidden';
      rail.setAttribute('data-omelette-chrome', '');
      rail.style.setProperty('--deck-aspect', this.designWidth + '/' + this.designHeight);
      // Edge auto-scroll while dragging a thumb near the rail's top/bottom
      // so off-screen drop targets are reachable. Native dragover fires
      // continuously while the pointer is stationary, so a per-event nudge
      // (ramped by edge proximity) is enough — no rAF loop needed.
      rail.addEventListener('dragover', e => {
        if (this._dragFrom == null) return;
        const r = rail.getBoundingClientRect();
        const EDGE = 40;
        const dt = e.clientY - r.top;
        const db = r.bottom - e.clientY;
        if (dt < EDGE) rail.scrollTop -= Math.ceil((EDGE - dt) / 3);else if (db < EDGE) rail.scrollTop += Math.ceil((EDGE - db) / 3);
      });
      const menu = document.createElement('div');
      menu.className = 'ctxmenu export-hidden';
      menu.setAttribute('data-omelette-chrome', '');
      menu.innerHTML = `
        <button type="button" data-act="skip">Skip slide</button>
        <button type="button" data-act="up">Move up</button>
        <button type="button" data-act="down">Move down</button>
        <button type="button" data-act="duplicate">Duplicate slide</button>
        <hr>
        <button type="button" data-act="delete">Delete slide</button>
      `;
      menu.addEventListener('click', e => {
        const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        if (!act) return;
        const i = this._menuIndex;
        this._closeMenu();
        if (act === 'skip') this._toggleSkip(i);else if (act === 'up') this._moveSlide(i, i - 1);else if (act === 'down') this._moveSlide(i, i + 1);else if (act === 'duplicate') this._duplicateSlide(i);else if (act === 'delete') this._openConfirm(i);
      });
      menu.addEventListener('contextmenu', e => e.preventDefault());

      // Rail resize handle — drag to set --deck-rail-w, persisted to
      // localStorage so the width survives reloads.
      const resize = document.createElement('div');
      resize.className = 'rail-resize export-hidden';
      resize.setAttribute('data-omelette-chrome', '');
      resize.addEventListener('pointerdown', e => {
        e.preventDefault();
        resize.setPointerCapture(e.pointerId);
        resize.setAttribute('data-dragging', '');
        const move = ev => this._setRailWidth(ev.clientX);
        const up = () => {
          resize.removeEventListener('pointermove', move);
          resize.removeEventListener('pointerup', up);
          resize.removeEventListener('pointercancel', up);
          resize.removeAttribute('data-dragging');
          try {
            localStorage.setItem('deck-stage.railWidth', String(this._railPx));
          } catch (err) {}
        };
        resize.addEventListener('pointermove', move);
        resize.addEventListener('pointerup', up);
        resize.addEventListener('pointercancel', up);
      });

      // Delete-confirm dialog — mirrors the SPA's ConfirmDialog layout.
      const confirm = document.createElement('div');
      confirm.className = 'confirm-backdrop export-hidden';
      confirm.setAttribute('data-omelette-chrome', '');
      confirm.innerHTML = `
        <div class="confirm" role="dialog" aria-modal="true">
          <div class="body">
            <div class="title">Delete slide?</div>
            <div class="msg">This slide will be removed from the deck.</div>
          </div>
          <div class="footer">
            <button type="button" class="cancel">Cancel</button>
            <button type="button" class="danger">Delete</button>
          </div>
        </div>
      `;
      confirm.addEventListener('click', e => {
        if (e.target === confirm) this._closeConfirm();
      });
      confirm.querySelector('.cancel').addEventListener('click', () => this._closeConfirm());
      confirm.querySelector('.danger').addEventListener('click', () => {
        const i = this._confirmIndex;
        this._closeConfirm();
        this._deleteSlide(i);
      });
      this._root.append(style, rail, resize, stage, overlay, menu, confirm);
      this._canvas = canvas;
      this._stage = stage;
      this._slot = slot;
      this._overlay = overlay;
      this._rail = rail;
      this._resize = resize;
      this._menu = menu;
      this._confirm = confirm;
      this._countEl = overlay.querySelector('.current');
      this._totalEl = overlay.querySelector('.total');

      // Restore persisted rail width.
      let rw = 188;
      try {
        const s = localStorage.getItem('deck-stage.railWidth');
        if (s) rw = parseInt(s, 10) || rw;
      } catch (err) {}
      this._setRailWidth(rw);
      this._syncRailHidden();
    }
    _setRailWidth(px) {
      const w = Math.max(120, Math.min(360, Math.round(px)));
      this._railPx = w;
      this.style.setProperty('--deck-rail-w', w + 'px');
      this._fit();
      // _scaleThumbs forces a sync layout (frame.offsetWidth) then writes
      // N transforms. During a resize drag this runs per-pointermove;
      // coalesce to one per frame.
      if (!this._scaleRaf) {
        this._scaleRaf = requestAnimationFrame(() => {
          this._scaleRaf = null;
          this._scaleThumbs();
        });
      }
    }

    /** @page must live in the document stylesheet — it's a no-op inside
     *  shadow DOM. Inject/update a single <head> style tag so the print
     *  sheet matches the design size and Save-as-PDF yields one slide per
     *  page with no margins. */
    _syncPrintPageRule() {
      const id = 'deck-stage-print-page';
      let tag = document.getElementById(id);
      if (!tag) {
        tag = document.createElement('style');
        tag.id = id;
        document.head.appendChild(tag);
      }
      tag.textContent = '@page { size: ' + this.designWidth + 'px ' + this.designHeight + 'px; margin: 0; } ' + '@media print { html, body { margin: 0 !important; padding: 0 !important; background: none !important; overflow: visible !important; height: auto !important; } ' + '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; } ' +
      // Jump authored animations/transitions to their end state so print
      // never captures mid-entrance — pairs with the beforeprint handler
      // in connectedCallback that sets data-deck-active on every slide.
      '*, *::before, *::after { animation-delay: -99s !important; animation-duration: .001s !important; ' + 'animation-iteration-count: 1 !important; animation-fill-mode: both !important; ' + 'animation-play-state: running !important; transition-duration: 0s !important; } }';
    }
    _onSlotChange() {
      // Rail mutations (delete/move/duplicate) already reconcile synchronously and
      // emit slidechange with reason 'api'; skip the async slotchange that
      // would otherwise re-broadcast with reason 'init'.
      if (this._squelchSlotChange) {
        this._squelchSlotChange = false;
        return;
      }
      this._collectSlides();
      this._restoreIndex();
      this._applyIndex({
        showOverlay: false,
        broadcast: true,
        reason: 'init'
      });
      this._fit();
    }
    _collectSlides() {
      const assigned = this._slot.assignedElements({
        flatten: true
      });
      this._slides = assigned.filter(el => {
        // Skip template/style/script nodes even if someone slots them.
        const tag = el.tagName;
        return tag !== 'TEMPLATE' && tag !== 'SCRIPT' && tag !== 'STYLE';
      });
      this._slideSet = new Set(this._slides);
      this._slides.forEach((slide, i) => {
        const n = i + 1;
        slide.setAttribute('data-screen-label', `${pad2(n)} ${getSlideLabel(slide)}`);

        // Validation attribute for comment flow / auto-checks.
        if (!slide.hasAttribute('data-om-validate')) {
          slide.setAttribute('data-om-validate', VALIDATE_ATTR);
        }
        slide.setAttribute('data-deck-slide', String(i));
      });
      if (this._totalEl) this._totalEl.textContent = String(this._slides.length || 1);
      if (this._index >= this._slides.length) this._index = Math.max(0, this._slides.length - 1);
      this._markLastVisible();
      this._renderRail();
    }

    /** Tag the last non-skipped slide so print CSS can drop its
     *  break-after (see the @media print comment above — :last-child
     *  alone matches a hidden skipped slide). */
    _markLastVisible() {
      let last = null;
      this._slides.forEach(s => {
        s.removeAttribute('data-deck-last-visible');
        if (!s.hasAttribute('data-deck-skip')) last = s;
      });
      if (last) last.setAttribute('data-deck-last-visible', '');
    }
    _loadNotes() {
      const tag = document.getElementById('speaker-notes');
      if (!tag) {
        this._notes = [];
        return;
      }
      try {
        const parsed = JSON.parse(tag.textContent || '[]');
        if (Array.isArray(parsed)) this._notes = parsed;
      } catch (e) {
        console.warn('[deck-stage] Failed to parse #speaker-notes JSON:', e);
        this._notes = [];
      }
    }
    _restoreIndex() {
      // The host's ?slide= param is delivered as a #<int> hash (1-indexed) on
      // the iframe src. No hash → slide 1; the deck itself keeps no position
      // state across loads.
      const h = (location.hash || '').match(/^#(\d+)$/);
      if (h) {
        const n = parseInt(h[1], 10) - 1;
        if (n >= 0 && n < this._slides.length) this._index = n;
      }
    }
    _applyIndex({
      showOverlay = true,
      broadcast = true,
      reason = 'init'
    } = {}) {
      if (!this._slides.length) return;
      const prev = this._prevIndex == null ? -1 : this._prevIndex;
      const curr = this._index;
      // Keep the iframe's own hash in sync so an in-iframe location.reload()
      // (reload banner path in viewer-handle.ts) lands on the current slide,
      // not the stale deep-link hash from initial load.
      try {
        history.replaceState(null, '', '#' + (curr + 1));
      } catch (e) {}
      this._slides.forEach((s, i) => {
        if (i === curr) s.setAttribute('data-deck-active', '');else s.removeAttribute('data-deck-active');
      });
      if (this._countEl) this._countEl.textContent = String(curr + 1);
      // Follow-scroll on every navigation (init deep-link, keyboard, click,
      // tap, external goTo) — the only time we *don't* want the rail to
      // track current is after a rail-internal mutation, where _renderRail
      // has already restored the user's scroll position and yanking back to
      // current would undo it.
      this._syncRail(reason !== 'mutation');
      if (broadcast) {
        // (1) Legacy: host-window postMessage for speaker-notes renderers.
        try {
          window.postMessage({
            slideIndexChanged: curr,
            deckTotal: this._slides.length,
            deckSkipped: this._skippedIndices()
          }, '*');
        } catch (e) {}

        // (2) In-page CustomEvent on the <deck-stage> element itself.
        //     Bubbles and composes out of shadow DOM so slide code can listen:
        //       document.querySelector('deck-stage').addEventListener('slidechange', e => {
        //         e.detail.index, e.detail.previousIndex, e.detail.total, e.detail.slide, e.detail.reason
        //       });
        const detail = {
          index: curr,
          previousIndex: prev,
          total: this._slides.length,
          slide: this._slides[curr] || null,
          previousSlide: prev >= 0 ? this._slides[prev] || null : null,
          reason: reason // 'init' | 'keyboard' | 'click' | 'tap' | 'api'
        };
        this.dispatchEvent(new CustomEvent('slidechange', {
          detail,
          bubbles: true,
          composed: true
        }));
      }
      this._prevIndex = curr;
      if (showOverlay) this._flashOverlay();
    }
    _flashOverlay() {
      // Host posts __omelette_presenting while in fullscreen/tab presentation
      // mode — suppress the nav footer entirely (both hover and slide-change
      // flash) so the audience sees clean slides.
      if (!this._overlay || this._presenting) return;
      this._overlay.setAttribute('data-visible', '');
      if (this._hideTimer) clearTimeout(this._hideTimer);
      this._hideTimer = setTimeout(() => {
        this._overlay.removeAttribute('data-visible');
      }, OVERLAY_HIDE_MS);
    }
    _railWidth() {
      // State-based, no offsetWidth: the first _fit() can run before the
      // rail has had layout on some load paths, and a 0 there paints the
      // slide full-width for one frame before the post-slotchange _fit()
      // corrects it.
      if (!this._railEnabled || !this._railVisible || this.hasAttribute('no-rail') || this.hasAttribute('noscale') || this._presenting || this._previewMode || NARROW_MQ.matches) return 0;
      return this._railPx || 0;
    }
    _fit() {
      if (!this._canvas) return;
      const stage = this._canvas.parentElement;
      // PPTX export sets noscale so the DOM capture sees authored-size
      // geometry — the scaled canvas is in shadow DOM, so the exporter's
      // resetTransformSelector can't reach .canvas.style.transform directly.
      if (this.hasAttribute('noscale')) {
        this._canvas.style.transform = 'none';
        if (stage) stage.style.left = '0';
        if (this._overlay) this._overlay.style.marginLeft = '0';
        return;
      }
      const rw = this._railWidth();
      if (stage) stage.style.left = rw + 'px';
      // Overlay is centred on the viewport via left:50% + translate(-50%);
      // marginLeft shifts the centre by rw/2 so it lands in the middle of
      // the [rw, innerWidth] stage region.
      if (this._overlay) this._overlay.style.marginLeft = rw / 2 + 'px';
      const vw = window.innerWidth - rw;
      const vh = window.innerHeight;
      const s = Math.min(vw / this.designWidth, vh / this.designHeight);
      this._canvas.style.transform = `scale(${s})`;
    }
    _onResize() {
      this._fit();
      // Crossing the narrow-viewport breakpoint reveals the rail — rerun the
      // thumbnail scale the same way _setRailWidth does.
      if (!this._scaleRaf) {
        this._scaleRaf = requestAnimationFrame(() => {
          this._scaleRaf = null;
          this._scaleThumbs();
        });
      }
    }
    _onMouseMove() {
      // Keep overlay visible while mouse moves; hide after idle.
      this._flashOverlay();
    }
    _onMessage(e) {
      const d = e.data;
      if (d && typeof d.__omelette_presenting === 'boolean') {
        this._presenting = d.__omelette_presenting;
        if (this._presenting && this._overlay) {
          this._overlay.removeAttribute('data-visible');
          if (this._hideTimer) clearTimeout(this._hideTimer);
        }
        this._syncRailHidden();
        this._closeMenu();
        this._closeConfirm();
        this._fit();
        this._scaleThumbs();
      }
      // Host's Preview segment (ViewerMode='none'): the rail's drag-reorder /
      // right-click skip-delete affordances are editing chrome, so hide it
      // while the user is just looking at the deck. Same hard-hide path as
      // presenting; independent of the user's _railVisible preference so
      // returning to Edit restores whatever they had.
      if (d && typeof d.__omelette_preview_mode === 'boolean') {
        if (d.__omelette_preview_mode === this._previewMode) return;
        this._previewMode = d.__omelette_preview_mode;
        this._syncRailHidden();
        this._closeMenu();
        this._closeConfirm();
        this._fit();
        this._scaleThumbs();
      }
      // Per-viewer show/hide, driven by the TweaksPanel's auto-injected
      // "Thumbnail rail" toggle (or any author script). Independent of
      // whether the Tweaks panel itself is open — closing the panel
      // doesn't change rail visibility. Persists alongside rail width.
      if (d && d.type === '__deck_rail_visible' && typeof d.on === 'boolean') {
        if (d.on === this._railVisible) return;
        this._railVisible = d.on;
        try {
          localStorage.setItem('deck-stage.railVisible', d.on ? '1' : '0');
        } catch (e) {}
        // Arm the transition, commit it, then flip state — otherwise the
        // browser coalesces both writes and nothing animates on show.
        this.setAttribute('data-rail-anim', '');
        void (this._rail && this._rail.offsetHeight);
        this._syncRailHidden();
        this._fit();
        this._scaleThumbs();
        clearTimeout(this._railAnimTimer);
        this._railAnimTimer = setTimeout(() => this.removeAttribute('data-rail-anim'), 220);
      }
      if (d && d.type === '__omelette_rail_enabled') this._enableRail();
    }
    _syncRailHidden() {
      if (!this._rail) return;
      // data-presenting is the hard hide (display:none) for flag-off,
      // presentation mode, and the host's Preview segment — instant, no
      // transition. data-user-hidden is the soft hide (translateX(-100%))
      // for the viewer's rail toggle, so show/hide slides under
      // :host([data-rail-anim]).
      const hard = !this._railEnabled || this._presenting || this._previewMode;
      if (hard) this._rail.setAttribute('data-presenting', '');else this._rail.removeAttribute('data-presenting');
      if (!this._railVisible) this._rail.setAttribute('data-user-hidden', '');else this._rail.removeAttribute('data-user-hidden');
      // translateX hide leaves thumbs (tabIndex=0) in the tab order —
      // inert keeps them unfocusable while the rail is off-screen.
      this._rail.inert = hard || !this._railVisible;
    }
    _onTap(e) {
      // Touch-only — keyboard + the overlay toolbar cover nav on desktop.
      if (FINE_POINTER_MQ.matches) return;
      // Only taps that land on the stage (slide content or letterbox); the
      // overlay / rail / menus are siblings with their own click handlers.
      const path = e.composedPath();
      if (!this._stage || !path.includes(this._stage)) return;
      // Let interactive slide content keep the tap. composedPath (not
      // e.target.closest) so we see through open shadow roots — a <button>
      // inside a slide-authored custom element retargets e.target to the
      // host but still appears in the composed path.
      if (e.defaultPrevented) return;
      for (const n of path) {
        if (n === this._stage) break;
        if (n.matches && n.matches(INTERACTIVE_SEL)) return;
      }
      e.preventDefault();
      const rw = this._railWidth();
      const mid = rw + (window.innerWidth - rw) / 2;
      this._advance(e.clientX < mid ? -1 : 1, 'tap');
    }
    _onKey(e) {
      // Ignore when the user is typing.
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // Confirm dialog swallows nav keys while open; Escape cancels. Enter
      // is left to the focused button's native activation so Tab→Cancel
      // →Enter activates Cancel, not the window-level confirm path.
      if (this._confirm && this._confirm.hasAttribute('data-open')) {
        if (e.key === 'Escape') {
          this._closeConfirm();
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'Escape' && this._menu && this._menu.hasAttribute('data-open')) {
        this._closeMenu();
        e.preventDefault();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key;
      let handled = true;
      if (key === 'ArrowRight' || key === 'PageDown' || key === ' ' || key === 'Spacebar') {
        this._advance(1, 'keyboard');
      } else if (key === 'ArrowLeft' || key === 'PageUp') {
        this._advance(-1, 'keyboard');
      } else if (key === 'Home') {
        this._go(0, 'keyboard');
      } else if (key === 'End') {
        this._go(this._slides.length - 1, 'keyboard');
      } else if (key === 'r' || key === 'R') {
        this._go(0, 'keyboard');
      } else if (/^[0-9]$/.test(key)) {
        // 1..9 jump to that slide; 0 jumps to 10.
        const n = key === '0' ? 9 : parseInt(key, 10) - 1;
        if (n < this._slides.length) this._go(n, 'keyboard');
      } else {
        handled = false;
      }
      if (handled) {
        e.preventDefault();
        this._flashOverlay();
      }
    }
    _go(i, reason = 'api') {
      if (!this._slides.length) return;
      const clamped = Math.max(0, Math.min(this._slides.length - 1, i));
      if (clamped === this._index) {
        this._flashOverlay();
        return;
      }
      this._index = clamped;
      this._applyIndex({
        showOverlay: true,
        broadcast: true,
        reason
      });
    }

    /** Step forward/back skipping any slide marked data-deck-skip. Falls
     *  back to _go's clamp-at-ends behaviour (flash overlay) when there's
     *  nothing further in that direction. */
    _advance(dir, reason) {
      if (!this._slides.length) return;
      let i = this._index + dir;
      while (i >= 0 && i < this._slides.length && this._slides[i].hasAttribute('data-deck-skip')) {
        i += dir;
      }
      if (i < 0 || i >= this._slides.length) {
        this._flashOverlay();
        return;
      }
      this._go(i, reason);
    }

    // ── Thumbnail rail ────────────────────────────────────────────────────
    //
    // Thumbs are keyed by slide element and reused across _renderRail()
    // calls, so a reorder/delete is an O(changed) DOM shuffle instead of an
    // O(N) teardown-and-re-clone. Each thumb starts as a lightweight shell
    // (num + empty frame); the clone is materialized lazily by an
    // IntersectionObserver when the frame scrolls into (or near) view, so
    // only visible-ish slides pay the clone + image-decode cost.

    _renderRail() {
      if (!this._rail || !this._railEnabled) {
        this._thumbs = [];
        return;
      }
      // FLIP: record each *materialized* thumb's top before the reconcile.
      // Off-screen (non-materialized) thumbs don't need the animation and
      // skipping their getBoundingClientRect saves a forced layout per
      // off-screen thumb on large decks.
      const prevTops = new Map();
      (this._thumbs || []).forEach(({
        thumb,
        slide,
        host
      }) => {
        if (host) prevTops.set(slide, thumb.getBoundingClientRect().top);
      });
      const st = this._rail.scrollTop;

      // Reconcile: reuse thumbs that already exist for a slide, create
      // shells for new slides, drop thumbs for removed slides.
      const bySlide = new Map();
      (this._thumbs || []).forEach(t => bySlide.set(t.slide, t));
      const next = [];
      this._slides.forEach(slide => {
        let t = bySlide.get(slide);
        if (t) bySlide.delete(slide);else t = this._makeThumb(slide);
        next.push(t);
      });
      // Orphans — slides removed since last render.
      bySlide.forEach(t => {
        if (this._railObserver) this._railObserver.unobserve(t.frame);
        t.thumb.remove();
      });
      // Put thumbs into document order to match _slides. insertBefore on
      // an already-correctly-placed node is a no-op, so this is cheap
      // when nothing moved.
      next.forEach((t, i) => {
        const want = t.thumb;
        const at = this._rail.children[i];
        if (at !== want) this._rail.insertBefore(want, at || null);
        t.i = i;
        t.num.textContent = String(i + 1);
        if (t.slide.hasAttribute('data-deck-skip')) t.thumb.setAttribute('data-skip', '');else t.thumb.removeAttribute('data-skip');
      });
      this._thumbs = next;
      this._rail.scrollTop = st;
      if (prevTops.size) {
        const moved = [];
        this._thumbs.forEach(({
          thumb,
          slide
        }) => {
          const old = prevTops.get(slide);
          if (old == null) return;
          const dy = old - thumb.getBoundingClientRect().top;
          if (Math.abs(dy) < 1) return;
          thumb.style.transition = 'none';
          thumb.style.transform = `translateY(${dy}px)`;
          moved.push(thumb);
        });
        if (moved.length) {
          // Commit the inverted positions before flipping the transition
          // on — otherwise the browser coalesces both style writes and
          // nothing animates.
          void this._rail.offsetHeight;
          moved.forEach(t => {
            t.style.transition = 'transform 180ms cubic-bezier(.2,.7,.3,1)';
            t.style.transform = '';
          });
          setTimeout(() => moved.forEach(t => {
            t.style.transition = '';
          }), 220);
        }
      }
      requestAnimationFrame(() => this._scaleThumbs());
      this._syncRail(false);
    }

    /** Create a lightweight thumb shell for one slide. The clone is
     *  materialized later by the IntersectionObserver. Event handlers
     *  look up the thumb's *current* index (via _thumbs.indexOf) so the
     *  same element can be reused across reorders. */
    _makeThumb(slide) {
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      thumb.tabIndex = 0;
      const num = document.createElement('div');
      num.className = 'num';
      const frame = document.createElement('div');
      frame.className = 'frame';
      thumb.append(num, frame);
      const entry = {
        thumb,
        num,
        frame,
        slide,
        clone: null,
        host: null,
        i: -1
      };
      // entry.i is refreshed on every _renderRail reconcile pass, so
      // handlers read the thumb's current position without an O(N) scan.
      const idx = () => entry.i;
      thumb.addEventListener('click', () => this._go(idx(), 'click'));
      // ↑/↓ step through the rail when a thumb has focus. _go clamps at the
      // ends and _applyIndex→_syncRail scrolls the new current thumb into
      // view; we move focus to it (preventScroll — _syncRail already
      // scrolled) so a held key walks the whole list. stopPropagation keeps
      // this out of the window-level _onKey nav handler.
      thumb.addEventListener('keydown', e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        e.stopPropagation();
        this._go(idx() + (e.key === 'ArrowDown' ? 1 : -1), 'keyboard');
        const cur = this._thumbs && this._thumbs[this._index];
        if (cur) cur.thumb.focus({
          preventScroll: true
        });
      });
      thumb.addEventListener('contextmenu', e => {
        e.preventDefault();
        this._openMenu(idx(), e.clientX, e.clientY);
      });
      thumb.draggable = true;
      thumb.addEventListener('dragstart', e => {
        this._dragFrom = idx();
        thumb.setAttribute('data-dragging', '');
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', String(this._dragFrom));
        } catch (err) {}
      });
      thumb.addEventListener('dragend', () => {
        thumb.removeAttribute('data-dragging');
        this._clearDrop();
        this._dragFrom = null;
      });
      thumb.addEventListener('dragover', e => {
        if (this._dragFrom == null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = thumb.getBoundingClientRect();
        this._setDrop(idx(), e.clientY < r.top + r.height / 2 ? 'before' : 'after');
      });
      thumb.addEventListener('drop', e => {
        if (this._dragFrom == null) return;
        e.preventDefault();
        const i = idx();
        const r = thumb.getBoundingClientRect();
        let to = e.clientY >= r.top + r.height / 2 ? i + 1 : i;
        if (this._dragFrom < to) to--;
        const from = this._dragFrom;
        this._clearDrop();
        this._dragFrom = null;
        if (to !== from) this._moveSlide(from, to);
      });
      if (this._railObserver) this._railObserver.observe(frame);
      frame.__deckThumb = entry;
      return entry;
    }

    /** Lazily build the clone for a thumb that has scrolled into view. */
    _materialize(entry) {
      if (entry.host) return;
      const dw = this.designWidth,
        dh = this.designHeight;
      let clone = entry.slide.cloneNode(true);
      clone.removeAttribute('id');
      clone.removeAttribute('data-deck-active');
      clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      // Neuter heavy media; replace <video> with its poster so the box
      // keeps a visual. <iframe>/<audio> become empty placeholders.
      clone.querySelectorAll('iframe, audio, object, embed').forEach(el => {
        el.removeAttribute('src');
        el.removeAttribute('srcdoc');
        el.removeAttribute('data');
        el.innerHTML = '';
      });
      clone.querySelectorAll('video').forEach(el => {
        if (!el.poster) {
          el.removeAttribute('src');
          el.innerHTML = '';
          return;
        }
        const img = document.createElement('img');
        img.src = el.poster;
        img.alt = '';
        img.style.cssText = el.style.cssText + ';object-fit:cover;width:100%;height:100%;';
        img.className = el.className;
        el.replaceWith(img);
      });
      // Images: defer decode and let the browser pick the smallest
      // srcset candidate for the ~140px thumb. Same-URL clones reuse the
      // slide's decoded bitmap (URL-keyed cache), so the remaining cost
      // is paint/composite — lazy+async keeps that off the main thread.
      clone.querySelectorAll('img').forEach(el => {
        el.loading = 'lazy';
        el.decoding = 'async';
        if (el.srcset) el.sizes = (this._railPx || 188) + 'px';
      });
      // Custom elements inside the slide would have their
      // connectedCallback fire when the clone is appended. Replace them
      // with inert boxes so a component-heavy deck doesn't run N copies
      // of each component's mount logic in the rail. Children are
      // preserved so layout-wrapper elements (<my-column><h2>…</h2>)
      // still show their authored content; the querySelectorAll NodeList
      // is static, so nested custom elements in the moved subtree are
      // still visited on later iterations.
      const neuter = el => {
        const box = document.createElement('div');
        box.style.cssText = (el.getAttribute('style') || '') + ';background:rgba(0,0,0,0.06);border:1px dashed rgba(0,0,0,0.15);';
        box.className = el.className;
        // Preserve theming/i18n hooks so [data-*] / :lang() / [dir]
        // descendant selectors still match the neutered root.
        for (const a of el.attributes) {
          const n = a.name;
          if (n.startsWith('data-') || n.startsWith('aria-') || n === 'lang' || n === 'dir' || n === 'role' || n === 'title') {
            box.setAttribute(n, a.value);
          }
        }
        while (el.firstChild) box.appendChild(el.firstChild);
        return box;
      };
      // querySelectorAll('*') returns descendants only — a custom-element
      // slide root (<my-slide>…</my-slide>) would slip through and upgrade
      // on append. Swap the root first.
      if (clone.tagName.includes('-')) clone = neuter(clone);
      clone.querySelectorAll('*').forEach(el => {
        if (el.tagName.includes('-')) el.replaceWith(neuter(el));
      });
      clone.style.cssText += ';position:absolute;top:0;left:0;transform-origin:0 0;' + 'pointer-events:none;width:' + dw + 'px;height:' + dh + 'px;' + 'box-sizing:border-box;overflow:hidden;visibility:visible;opacity:1;';
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;inset:0;';
      this._syncThumbHostAttrs(host);
      const sr = host.attachShadow({
        mode: 'open'
      });
      if (this._adoptedSheet) sr.adoptedStyleSheets = [this._adoptedSheet];else {
        const st = document.createElement('style');
        st.textContent = this._authorCss || '';
        sr.appendChild(st);
      }
      sr.appendChild(clone);
      entry.frame.appendChild(host);
      entry.host = host;
      entry.clone = clone;
      if (this._thumbScale) clone.style.transform = 'scale(' + this._thumbScale + ')';
      // Once materialized the IO callback is a no-op early-return —
      // unobserve so scroll doesn't keep firing it.
      if (this._railObserver) this._railObserver.unobserve(entry.frame);
    }

    /** Re-clone a single thumb (live-update path). No-op if the thumb
     *  hasn't been materialized yet — it'll pick up current content when
     *  it scrolls into view. */
    _refreshThumb(slide) {
      const entry = (this._thumbs || []).find(t => t.slide === slide);
      if (!entry || !entry.host) return;
      entry.host.remove();
      entry.host = entry.clone = null;
      this._materialize(entry);
    }
    _scaleThumbs() {
      if (!this._thumbs || !this._thumbs.length) return;
      // Every frame is the same width; if it reads 0 the rail is
      // display:none (noscale / no-rail / presenting / print) — leave the
      // clones as-is and re-run when the rail is revealed.
      const fw = this._thumbs[0].frame.offsetWidth;
      if (!fw) return;
      this._thumbScale = fw / this.designWidth;
      this._thumbs.forEach(({
        clone
      }) => {
        if (clone) clone.style.transform = 'scale(' + this._thumbScale + ')';
      });
    }
    _setDrop(i, where) {
      // dragover fires at pointer-event rate; touch only the previous
      // and new target rather than sweeping all N thumbs.
      const t = this._thumbs && this._thumbs[i];
      if (this._dropOn && this._dropOn !== t) {
        this._dropOn.thumb.removeAttribute('data-drop');
      }
      if (t) t.thumb.setAttribute('data-drop', where);
      this._dropOn = t || null;
    }
    _clearDrop() {
      if (this._dropOn) this._dropOn.thumb.removeAttribute('data-drop');
      this._dropOn = null;
    }
    _syncRail(follow) {
      if (!this._thumbs) return;
      this._thumbs.forEach(({
        thumb
      }, i) => {
        if (i === this._index) {
          thumb.setAttribute('data-current', '');
          if (follow && typeof thumb.scrollIntoView === 'function') {
            thumb.scrollIntoView({
              block: 'nearest'
            });
          }
        } else {
          thumb.removeAttribute('data-current');
        }
      });
    }
    _openMenu(i, x, y) {
      if (!this._menu) return;
      this._menuIndex = i;
      const slide = this._slides[i];
      const skip = slide && slide.hasAttribute('data-deck-skip');
      this._menu.querySelector('[data-act="skip"]').textContent = skip ? 'Unskip slide' : 'Skip slide';
      this._menu.querySelector('[data-act="up"]').disabled = i <= 0;
      this._menu.querySelector('[data-act="down"]').disabled = i >= this._slides.length - 1;
      this._menu.querySelector('[data-act="delete"]').disabled = this._slides.length <= 1;
      // Place, then clamp to viewport after it's measurable.
      this._menu.style.left = x + 'px';
      this._menu.style.top = y + 'px';
      this._menu.setAttribute('data-open', '');
      const r = this._menu.getBoundingClientRect();
      const nx = Math.min(x, window.innerWidth - r.width - 4);
      const ny = Math.min(y, window.innerHeight - r.height - 4);
      this._menu.style.left = Math.max(4, nx) + 'px';
      this._menu.style.top = Math.max(4, ny) + 'px';
    }
    _closeMenu() {
      if (this._menu) this._menu.removeAttribute('data-open');
      this._menuIndex = -1;
    }
    _openConfirm(i) {
      if (!this._confirm) return;
      this._confirmIndex = i;
      this._confirm.querySelector('.title').textContent = 'Delete slide ' + (i + 1) + '?';
      this._confirm.setAttribute('data-open', '');
      const btn = this._confirm.querySelector('.danger');
      if (btn && btn.focus) btn.focus();
    }
    _closeConfirm() {
      if (this._confirm) this._confirm.removeAttribute('data-open');
      this._confirmIndex = -1;
    }
    _emitDeckChange(detail) {
      this.dispatchEvent(new CustomEvent('deckchange', {
        detail,
        bubbles: true,
        composed: true
      }));
    }
    _deleteSlide(i) {
      const slide = this._slides[i];
      if (!slide || this._slides.length <= 1) return;
      const wasCurrent = i === this._index;
      if (i < this._index || wasCurrent && i === this._slides.length - 1) this._index--;
      this._squelchSlotChange = true;
      slide.remove();
      this._emitDeckChange({
        action: 'delete',
        from: i,
        slide
      });
      this._collectSlides();
      this._applyIndex({
        showOverlay: true,
        broadcast: true,
        reason: 'mutation'
      });
    }
    _duplicateSlide(i) {
      const slide = this._slides[i];
      if (!slide) return;
      const copy = slide.cloneNode(true);
      // Strip ids so the document stays valid (no duplicate-id collisions
      // with the original). Same treatment _materialize gives rail clones.
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      // Insert after the original and make the copy active so it's the one
      // on screen. _collectSlides re-derives data-screen-label / data-deck-*
      // attrs, so the cloned values are overwritten.
      this._index = i + 1;
      this._squelchSlotChange = true;
      this.insertBefore(copy, slide.nextSibling);
      this._emitDeckChange({
        action: 'duplicate',
        from: i,
        to: i + 1,
        slide: copy
      });
      this._collectSlides();
      this._applyIndex({
        showOverlay: true,
        broadcast: true,
        reason: 'mutation'
      });
    }
    _toggleSkip(i) {
      const slide = this._slides[i];
      if (!slide) return;
      const on = !slide.hasAttribute('data-deck-skip');
      if (on) slide.setAttribute('data-deck-skip', '');else slide.removeAttribute('data-deck-skip');
      if (this._thumbs && this._thumbs[i]) {
        if (on) this._thumbs[i].thumb.setAttribute('data-skip', '');else this._thumbs[i].thumb.removeAttribute('data-skip');
      }
      this._markLastVisible();
      this._emitDeckChange({
        action: on ? 'skip' : 'unskip',
        from: i,
        slide
      });
      // Re-broadcast so the presenter popup's prev/next thumbnails re-pick
      // the nearest non-skipped slide without waiting for a nav event.
      try {
        window.postMessage({
          slideIndexChanged: this._index,
          deckTotal: this._slides.length,
          deckSkipped: this._skippedIndices()
        }, '*');
      } catch (e) {}
    }
    _skippedIndices() {
      const out = [];
      for (let i = 0; i < this._slides.length; i++) {
        if (this._slides[i].hasAttribute('data-deck-skip')) out.push(i);
      }
      return out;
    }
    _moveSlide(i, j) {
      if (j < 0 || j >= this._slides.length || j === i) return;
      const slide = this._slides[i];
      const ref = j < i ? this._slides[j] : this._slides[j].nextSibling;
      // Track the active slide across the reorder so the same content
      // stays on screen.
      const cur = this._index;
      if (cur === i) this._index = j;else if (i < cur && j >= cur) this._index = cur - 1;else if (i > cur && j <= cur) this._index = cur + 1;
      this._squelchSlotChange = true;
      this.insertBefore(slide, ref);
      this._emitDeckChange({
        action: 'move',
        from: i,
        to: j,
        slide
      });
      this._collectSlides();
      this._applyIndex({
        showOverlay: false,
        broadcast: true,
        reason: 'mutation'
      });
    }

    // Public API ------------------------------------------------------------

    /** Current slide index (0-based). */
    get index() {
      return this._index;
    }
    /** Total slide count. */
    get length() {
      return this._slides.length;
    }
    /** Programmatically navigate. */
    goTo(i) {
      this._go(i, 'api');
    }
    next() {
      this._advance(1, 'api');
    }
    prev() {
      this._advance(-1, 'api');
    }
    reset() {
      this._go(0, 'api');
    }
  }
  if (!customElements.get('deck-stage')) {
    customElements.define('deck-stage', DeckStage);
  }
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "slides/deck-stage.js", error: String((e && e.message) || e) }); }

// tenant-users-list.js
try { (() => {
/* global window */
// Tenant-admin · Usuários — list page on the shared shell. `ico` is global.

const USERS = [{
  nome: 'Fábio Ogawa',
  email: 'fabio@transportadoramodelo.com.br',
  papel: 'Administrador',
  pcls: 'error',
  acesso: 'Agora há pouco',
  st: ['success', 'Ativo'],
  ini: 'FO'
}, {
  nome: 'Mariana Costa',
  email: 'mariana@transportadoramodelo.com.br',
  papel: 'Financeiro',
  pcls: 'info',
  acesso: 'Hoje, 11:42',
  st: ['success', 'Ativo'],
  ini: 'MC'
}, {
  nome: 'Rafael Lima',
  email: 'rafael@transportadoramodelo.com.br',
  papel: 'Operação',
  pcls: 'warning',
  acesso: 'Ontem, 18:10',
  st: ['success', 'Ativo'],
  ini: 'RL'
}, {
  nome: 'Juliana Prado',
  email: 'juliana@transportadoramodelo.com.br',
  papel: 'Comercial',
  pcls: 'secondary',
  acesso: 'há 3 dias',
  st: ['success', 'Ativo'],
  ini: 'JP'
}, {
  nome: 'Carlos Mendes',
  email: 'carlos@transportadoramodelo.com.br',
  papel: 'Operação',
  pcls: 'warning',
  acesso: 'há 2 semanas',
  st: ['warning', 'Convite pendente'],
  ini: 'CM'
}, {
  nome: 'Ana Beatriz',
  email: 'ana@transportadoramodelo.com.br',
  papel: 'Somente leitura',
  pcls: 'secondary',
  acesso: 'Nunca',
  st: ['secondary', 'Inativo'],
  ini: 'AB'
}];
const AVCOL = ['#0284c7', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];
function row(u, i) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div class="cell-company"><span class="cell-avatar" style="background:${AVCOL[i % AVCOL.length]};color:#fff;font-size:12px;font-weight:700">${u.ini}</span><div style="min-width:0"><div class="name">${u.nome}</div><div class="doc" style="font-family:inherit">${u.email}</div></div></div></td>
    <td><span class="badge ${u.pcls}">${u.papel}</span></td>
    <td class="cell-date">${u.acesso}</td>
    <td><span class="badge ${u.st[0]}">${u.st[1]}</span></td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="Usuários">
  <div class="page-head">
    <div class="ph-icon">${ico('users', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Sistema <span>›</span> Usuários</p>
      <h1 class="ph-title">Usuários</h1>
      <p class="ph-desc">Membros da equipe com acesso ao sistema: papel/permissões, status do convite e último acesso.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Convidar usuário</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar por nome ou email..." /></div>
    <button class="btn btn-soft">Buscar</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Papel</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> de <strong>6</strong> usuários · <strong>5</strong> de <strong>5</strong> assentos usados</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Usuário')}</th>
          <th>${sortable('Papel')}</th>
          <th>${sortable('Último acesso')}</th>
          <th>${sortable('Status')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${USERS.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option></select></div>
      <div class="pg-nav"><button class="pg-btn" disabled>‹</button><button class="pg-btn active">1</button><button class="pg-btn">›</button></div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Usuários',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "tenant-users-list.js", error: String((e && e.message) || e) }); }

// ui_kits/app/screens-admin.jsx
try { (() => {
/* HiperTMS app UI-kit — Platform admin: pricing suggestions (FCL/LCL/Taxas/Margens). */
const {
  useState: useAd
} = React;
const FCL_VEHICLES = ['VUC 3t', 'Truck 14t', 'Carreta 27t', 'Bitrem 37t'];
const FCL_ROWS = [['0 – 150 km', [680, 1180, 1740, 2280]], ['151 – 300 km', [1120, 1980, 2820, 3680]], ['301 – 500 km', [1880, 3240, 4560, 5940]], ['501 – 1000 km', [3120, 5410, 7680, 9920]], ['> 1000 km', [5240, 8960, 12480, 16100]]];
const MARGIN_ROWS = [['Carga seca', 32, 28, 24], ['Refrigerada', 38, 34, 30], ['Granel', 26, 22, 18], ['Cargas especiais', 44, 40, 35]];
const FEE_ROWS = [['Taxa de emissão CT-e', 'R$ 4,50', 'por documento'], ['Ad valorem', '0,30%', 'sobre valor da carga'], ['GRIS', '0,10%', 'sobre valor da carga'], ['Taxa de coleta', 'R$ 85,00', 'por coleta urbana'], ['Pedágio (eixo)', 'R$ 0,44', 'por km estimado']];
const ADMIN_TABS = [['fcl', 'Custo Dedicado (FCL)'], ['lcl', 'Custo Fracionado (LCL)'], ['fees', 'Taxas administrativas'], ['margins', 'Margens']];
function PlatformPricing() {
  const [tab, setTab] = useAd('fcl');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--color-fg)',
      margin: 0
    }
  }, "Sugest\xF5es de pre\xE7o"), /*#__PURE__*/React.createElement(Badge, {
    variant: "info",
    dot: true
  }, "Admin plataforma")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--color-fg-muted)',
      marginTop: 4
    }
  }, "Tabela nacional modelo herdada por novos tenants. Baseada na Resolu\xE7\xE3o ANTT vigente.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Btn, {
    variant: "outline",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "history",
      size: 15
    })
  }, "Hist\xF3rico"), /*#__PURE__*/React.createElement(Btn, {
    variant: "primary",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "save",
      size: 15,
      color: "var(--color-primary-content)"
    })
  }, "Publicar tabela"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4,
      borderBottom: '1px solid var(--color-surface-border)'
    }
  }, ADMIN_TABS.map(([id, label]) => {
    const on = tab === id;
    return /*#__PURE__*/React.createElement("button", {
      key: id,
      onClick: () => setTab(id),
      style: {
        padding: '9px 14px',
        marginBottom: -1,
        border: 'none',
        borderBottom: `2px solid ${on ? 'var(--color-primary)' : 'transparent'}`,
        background: 'transparent',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        fontWeight: on ? 600 : 500,
        color: on ? 'var(--color-primary)' : 'var(--color-fg-muted)'
      }
    }, label);
  })), (tab === 'fcl' || tab === 'lcl') && /*#__PURE__*/React.createElement(Card, {
    pad: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 18px',
      borderBottom: '1px solid var(--color-surface-border)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, tab === 'fcl' ? 'Custo por viagem · R$ (frete-peso dedicado)' : 'Custo fracionado · R$ por 100 kg'), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--color-fg-subtle)'
    }
  }, "Atualizado 01/2025 \xB7 Tabela A ANTT")), /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: 'var(--color-base-200)'
    }
  }, /*#__PURE__*/React.createElement(KitTh, null, "Faixa de dist\xE2ncia"), FCL_VEHICLES.map(v => /*#__PURE__*/React.createElement("th", {
    key: v,
    style: {
      textAlign: 'right',
      padding: '11px 16px',
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '.05em',
      color: 'var(--color-fg-subtle)'
    }
  }, v)), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 44
    }
  }))), /*#__PURE__*/React.createElement("tbody", null, FCL_ROWS.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r[0],
    style: {
      borderBottom: i === FCL_ROWS.length - 1 ? 'none' : '1px solid var(--color-surface-border)'
    }
  }, /*#__PURE__*/React.createElement(KitTd, {
    bold: true
  }, r[0]), r[1].map((v, j) => /*#__PURE__*/React.createElement("td", {
    key: j,
    style: {
      padding: '11px 16px',
      textAlign: 'right',
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      color: 'var(--color-fg)'
    }
  }, (tab === 'lcl' ? v / 12 : v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }))), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "pencil",
    size: 14,
    color: "var(--color-fg-subtle)"
  }))))))), tab === 'margins' && /*#__PURE__*/React.createElement(Card, {
    pad: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: 'var(--color-base-200)'
    }
  }, /*#__PURE__*/React.createElement(KitTh, null, "Tipo de carga"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: 'right',
      padding: '11px 16px',
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      color: 'var(--color-fg-subtle)'
    }
  }, "Curta dist."), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: 'right',
      padding: '11px 16px',
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      color: 'var(--color-fg-subtle)'
    }
  }, "M\xE9dia dist."), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: 'right',
      padding: '11px 16px',
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      color: 'var(--color-fg-subtle)'
    }
  }, "Longa dist."))), /*#__PURE__*/React.createElement("tbody", null, MARGIN_ROWS.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r[0],
    style: {
      borderBottom: i === MARGIN_ROWS.length - 1 ? 'none' : '1px solid var(--color-surface-border)'
    }
  }, /*#__PURE__*/React.createElement(KitTd, {
    bold: true
  }, r[0]), [r[1], r[2], r[3]].map((v, j) => /*#__PURE__*/React.createElement("td", {
    key: j,
    style: {
      padding: '11px 16px',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--color-primary)'
    }
  }, v, "%")))))))), tab === 'fees' && /*#__PURE__*/React.createElement(Card, {
    pad: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: 'var(--color-base-200)'
    }
  }, /*#__PURE__*/React.createElement(KitTh, null, "Taxa"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: 'right',
      padding: '11px 16px',
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      color: 'var(--color-fg-subtle)'
    }
  }, "Valor"), /*#__PURE__*/React.createElement(KitTh, null, "Base"))), /*#__PURE__*/React.createElement("tbody", null, FEE_ROWS.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r[0],
    style: {
      borderBottom: i === FEE_ROWS.length - 1 ? 'none' : '1px solid var(--color-surface-border)'
    }
  }, /*#__PURE__*/React.createElement(KitTd, null, r[0]), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '11px 16px',
      textAlign: 'right',
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, r[1]), /*#__PURE__*/React.createElement(KitTd, {
    muted: true
  }, r[2])))))));
}
window.PlatformPricing = PlatformPricing;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/screens-admin.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/screens-fiscal.jsx
try { (() => {
/* HiperTMS app UI-kit — Fiscal: CT-e and MDF-e detail (document view). */

function DocHeader({
  title,
  subtitle,
  status,
  statusKey,
  actions
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--color-fg-subtle)',
      marginBottom: 4
    }
  }, "Opera\xE7\xE3o \xB7 ", title.split(' ')[0]), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--color-fg)',
      margin: 0
    }
  }, title), /*#__PURE__*/React.createElement(StatusBadge, {
    status: statusKey
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--color-fg-muted)',
      marginTop: 5,
      fontFamily: 'var(--font-mono)'
    }
  }, subtitle)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, actions));
}
function CteDetail() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(DocHeader, {
    title: "CT-e N\xBA 4821",
    subtitle: "S\xE9rie 1 \u2022 41 2506 12.345.678/0001-90 57 001 000004821 1 8273 6451",
    statusKey: "autorizado",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Btn, {
      variant: "primary",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "download",
        size: 15,
        color: "var(--color-primary-content)"
      })
    }, "Baixar DACTE (PDF)"), /*#__PURE__*/React.createElement(Btn, {
      variant: "outline",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "ellipsis-vertical",
        size: 16
      })
    }, "A\xE7\xF5es"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.5fr 1fr',
      gap: 18,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Section, {
    title: "Dados do documento"
  }, /*#__PURE__*/React.createElement(Group, {
    cols: 2
  }, /*#__PURE__*/React.createElement(FieldKV, {
    label: "Modelo / S\xE9rie",
    value: "57 \xB7 S\xE9rie 1"
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Protocolo Sefaz",
    value: "141250000482173",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Data de autoriza\xE7\xE3o",
    value: "12/06/2025 08:14"
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Embarque vinculado",
    value: "EMB-2025-1188",
    link: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "CFOP",
    value: "6352",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Natureza da opera\xE7\xE3o",
    value: "Transporte intermunicipal"
  }))), /*#__PURE__*/React.createElement(Section, {
    title: "Presta\xE7\xE3o do servi\xE7o"
  }, /*#__PURE__*/React.createElement(Group, {
    cols: 3
  }, /*#__PURE__*/React.createElement(FieldKV, {
    label: "Origem",
    value: "S\xE3o Paulo / SP"
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Destino",
    value: "Curitiba / PR"
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Dist\xE2ncia",
    value: "408 km",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Valor da presta\xE7\xE3o",
    value: "R$ 4.000,00",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Base de c\xE1lculo ICMS",
    value: "R$ 4.863,64",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "ICMS (12%)",
    value: "R$ 583,64",
    mono: true
  }))), /*#__PURE__*/React.createElement(Section, {
    title: "Tomador, remetente e destinat\xE1rio"
  }, /*#__PURE__*/React.createElement(Group, {
    cols: 2
  }, /*#__PURE__*/React.createElement(FieldKV, {
    label: "Tomador",
    value: "Brasil Foods S/A"
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "CNPJ tomador",
    value: "01.234.567/0001-89",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Remetente",
    value: "Brasil Foods S/A \u2014 SP"
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Destinat\xE1rio",
    value: "Atacad\xE3o Curitiba \u2014 PR"
  })))), /*#__PURE__*/React.createElement(Card, {
    style: {
      position: 'sticky',
      top: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, "DACTE"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      borderRadius: 'var(--radius-lg)',
      border: '1px dashed var(--color-surface-border)',
      background: 'var(--color-base-100)',
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "file-check-2",
    size: 34,
    color: "var(--color-primary)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, "DACTE dispon\xEDvel"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--color-fg-muted)',
      textAlign: 'center'
    }
  }, "Documento autorizado pela SEFAZ. Baixe o PDF ou o XML."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(Btn, {
    variant: "outline",
    size: "sm",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "download",
      size: 14
    })
  }, "PDF"), /*#__PURE__*/React.createElement(Btn, {
    variant: "outline",
    size: "sm",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "code",
      size: 14
    })
  }, "XML"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      padding: 12,
      borderRadius: 'var(--radius-lg)',
      background: 'var(--color-success-tint)',
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "badge-check",
    size: 18,
    color: "var(--color-success-ink)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--color-success-ink)',
      lineHeight: 1.5
    }
  }, "Autorizado o uso do CT-e em 12/06/2025 \xE0s 08:14.")))));
}
const CTES_NO_MDFE = [['CT-e 4821', 'Brasil Foods S/A', 'Curitiba / PR', 'R$ 4.863,64'], ['CT-e 4822', 'Atacadão Sul', 'Joinville / SC', 'R$ 2.140,00'], ['CT-e 4823', 'Mercado União', 'Blumenau / SC', 'R$ 1.760,30']];
function MdfeDetail() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(DocHeader, {
    title: "MDF-e N\xBA 1190",
    subtitle: "S\xE9rie 1 \u2022 41 2506 12.345.678/0001-90 58 001 000001190 7 2210 9943",
    statusKey: "autorizado",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Btn, {
      variant: "primary",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "download",
        size: 15,
        color: "var(--color-primary-content)"
      })
    }, "Baixar DAMDFE"), /*#__PURE__*/React.createElement(Btn, {
      variant: "outline",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "lock",
        size: 15
      })
    }, "Encerrar"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.5fr 1fr',
      gap: 18,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Section, {
    title: "Dados do manifesto"
  }, /*#__PURE__*/React.createElement(Group, {
    cols: 2
  }, /*#__PURE__*/React.createElement(FieldKV, {
    label: "Modelo / S\xE9rie",
    value: "58 \xB7 S\xE9rie 1"
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Protocolo Sefaz",
    value: "141250000119007",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "UF in\xEDcio \u2192 fim",
    value: "SP \u2192 SC"
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Data de emiss\xE3o",
    value: "12/06/2025 06:50"
  }))), /*#__PURE__*/React.createElement(Section, {
    title: "Ve\xEDculo e condutor"
  }, /*#__PURE__*/React.createElement(Group, {
    cols: 2
  }, /*#__PURE__*/React.createElement(FieldKV, {
    label: "Ve\xEDculo de tra\xE7\xE3o",
    value: "Carreta 27t \xB7 ABC-1D23"
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "RNTRC",
    value: "01234567",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Condutor",
    value: "Jos\xE9 Aparecido"
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "CPF condutor",
    value: "123.456.789-00",
    mono: true
  }))), /*#__PURE__*/React.createElement(Section, {
    title: "Totais"
  }, /*#__PURE__*/React.createElement(Group, {
    cols: 3
  }, /*#__PURE__*/React.createElement(FieldKV, {
    label: "CT-e vinculados",
    value: "3",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Peso total",
    value: "38.200 kg",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Valor total carga",
    value: "R$ 412.300,00",
    mono: true
  })))), /*#__PURE__*/React.createElement(Card, {
    pad: 0
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 20px 0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, "CT-e no manifesto")), /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: 'var(--font-sans)',
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("tbody", null, CTES_NO_MDFE.map((c, i) => /*#__PURE__*/React.createElement("tr", {
    key: c[0],
    style: {
      borderTop: '1px solid var(--color-surface-border)'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '11px 20px',
      fontFamily: 'var(--font-mono)',
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, c[0]), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '11px 8px',
      fontSize: 12.5,
      color: 'var(--color-fg-muted)'
    }
  }, c[2]), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '11px 20px',
      textAlign: 'right',
      fontFamily: 'var(--font-mono)',
      fontSize: 12.5,
      color: 'var(--color-fg)'
    }
  }, c[3]))))))));
}
Object.assign(window, {
  CteDetail,
  MdfeDetail
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/screens-fiscal.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/screens-main.jsx
try { (() => {
/* HiperTMS app UI-kit — screens. Uses primitives from shell.jsx (window). */
const {
  useState: useS
} = React;
const BRL = n => 'R$ ' + n.toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/* ====================== LOGIN ====================== */
function LoginScreen({
  onLogin
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: 44,
      overflow: 'hidden',
      background: 'linear-gradient(160deg,#0e0f13,#16181d 55%,#23262e)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'radial-gradient(closest-side at 22% 18%, rgba(255,90,31,.28), transparent 60%), radial-gradient(closest-side at 80% 82%, rgba(30,58,95,.42), transparent 62%)'
    }
  }), /*#__PURE__*/React.createElement("img", {
    src: "../../assets/hipertms-wordmark-dark.svg",
    alt: "HiperTMS",
    style: {
      height: 30,
      position: 'relative',
      alignSelf: 'flex-start'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      padding: '5px 12px',
      borderRadius: 'var(--radius-full)',
      border: '1px solid rgba(255,255,255,.15)',
      background: 'rgba(255,255,255,.06)',
      color: 'rgba(255,255,255,.8)',
      fontSize: 12,
      fontWeight: 600,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 14,
    color: "var(--color-accent-warm-soft)"
  }), " O TMS feito para vender frete"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 34,
      lineHeight: 1.1,
      fontWeight: 800,
      color: '#fff',
      letterSpacing: '-0.02em',
      margin: 0,
      maxWidth: '14ch'
    }
  }, "Cadastrou, cotou."), /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'rgba(255,255,255,.7)',
      fontSize: 15,
      lineHeight: 1.7,
      maxWidth: '36ch',
      marginTop: 14
    }
  }, "Precifique fretes em segundos e saiba sua margem antes de rodar.")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      gap: 22,
      color: 'rgba(255,255,255,.55)',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("span", null, "CT-e \xB7 MDF-e"), /*#__PURE__*/React.createElement("span", null, "Cota\xE7\xE3o em segundos"), /*#__PURE__*/React.createElement("span", null, "R$ 89/m\xEAs"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 44,
      background: 'var(--color-base-100)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 340
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--color-fg)',
      margin: 0
    }
  }, "Entrar"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--color-fg-muted)',
      marginTop: 6
    }
  }, "Acesse sua opera\xE7\xE3o."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      marginTop: 24
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "E-mail",
    value: "marina@rotasul.com.br"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Senha",
    value: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    type: "password"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("a", {
    style: {
      fontSize: 13,
      color: 'var(--color-primary)',
      textDecoration: 'none'
    }
  }, "Esqueci minha senha")), /*#__PURE__*/React.createElement(Btn, {
    variant: "primary",
    size: "lg",
    style: {
      width: '100%'
    },
    iconRight: /*#__PURE__*/React.createElement(Icon, {
      name: "arrow-right",
      size: 16,
      color: "var(--color-primary-content)"
    }),
    onClick: onLogin
  }, "Entrar"), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      fontSize: 13,
      color: 'var(--color-fg-muted)'
    }
  }, "Novo por aqui? ", /*#__PURE__*/React.createElement("a", {
    style: {
      color: 'var(--color-primary)',
      textDecoration: 'none',
      fontWeight: 600
    }
  }, "Criar conta gr\xE1tis"))))));
}
function Field({
  label,
  value,
  type = 'text'
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-fg)'
    }
  }, label), /*#__PURE__*/React.createElement("input", {
    defaultValue: value,
    type: type,
    style: {
      height: 38,
      border: '1px solid var(--color-surface-border)',
      borderRadius: 'var(--radius-md)',
      padding: '0 12px',
      fontSize: 14,
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-fg)',
      background: 'var(--color-surface-raised)',
      outline: 'none',
      boxShadow: 'var(--shadow-inner-soft)'
    }
  }));
}

/* ====================== DASHBOARD ====================== */
const OP_PANELS = [{
  title: 'Cotações',
  icon: 'file-text',
  rows: [['Em cotação', 12, 'em_cotacao'], ['Enviadas', 8, 'enviada'], ['Aprovadas', 23, 'aprovada']]
}, {
  title: 'Embarques',
  icon: 'truck',
  rows: [['Pendentes', 6, 'pendente'], ['Em trânsito', 34, 'em_transito'], ['Entregues', 51, 'entregue']]
}, {
  title: 'Cargas',
  icon: 'clipboard-list',
  rows: [['Programadas', 9, 'pendente'], ['Coletadas', 18, 'em_transito'], ['Concluídas', 40, 'entregue']]
}, {
  title: 'Viagens',
  icon: 'map',
  rows: [['Planejadas', 5, 'pendente'], ['Em curso', 11, 'em_transito'], ['Encerradas', 28, 'encerrado']]
}];
const CHART = [40, 62, 55, 78, 70, 92, 84, 60, 75, 88, 96, 72];
function Dashboard() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 26,
      fontWeight: 700,
      color: 'var(--color-fg)',
      margin: 0
    }
  }, "Boa tarde, Marina!"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--color-fg-muted)',
      marginTop: 4
    }
  }, "Resumo operacional: cota\xE7\xF5es, embarques, programa\xE7\xE3o de cargas e viagens por estado.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Metric, {
    label: "Fretes em tr\xE2nsito",
    value: "34",
    icon: "truck",
    trend: "up",
    delta: "8 coletas",
    foot: "Resumo log\xEDstico em tempo real"
  }), /*#__PURE__*/React.createElement(Metric, {
    label: "Tarefas em aberto",
    value: "7",
    icon: "check-square",
    trend: "up",
    delta: "Minhas tarefas",
    foot: "Pend\xEAncias e em progresso"
  }), /*#__PURE__*/React.createElement(Metric, {
    label: "Oportunidades",
    value: "127",
    icon: "trending-up",
    trend: "up",
    delta: "Pipeline",
    foot: "Comercial / SDR"
  }), /*#__PURE__*/React.createElement(Metric, {
    label: "Contas a pagar vencidas",
    value: "R$ 12,4k",
    icon: "wallet",
    trend: "down",
    delta: "Aten\xE7\xE3o",
    foot: "Financeiro"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 14
    }
  }, OP_PANELS.map(p => /*#__PURE__*/React.createElement(Card, {
    key: p.title,
    pad: 16
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: p.icon,
    size: 16,
    color: "var(--color-primary)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, p.title)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 9
    }
  }, p.rows.map(([label, n, st]) => /*#__PURE__*/React.createElement("div", {
    key: label,
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    status: st
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, n))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.6fr 1fr',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, "Faturamento de frete \xB7 12 meses"), /*#__PURE__*/React.createElement(Badge, {
    variant: "success",
    dot: true
  }, "+18% vs. ano anterior")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 8,
      height: 150
    }
  }, CHART.map((v, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      height: v + '%',
      borderRadius: '4px 4px 0 0',
      background: i === 10 ? 'var(--color-primary)' : 'color-mix(in oklab, var(--color-primary) 30%, var(--color-base-200))'
    },
    title: v + '%'
  })))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, "Frota & documentos"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      marginTop: 16
    }
  }, [['Veículos ativos', '18', 'truck', 'success'], ['Motoristas', '21', 'user', 'success'], ['Licenciamento a vencer', '3', 'alert-triangle', 'warning'], ['Exame toxicológico', '1', 'alert-triangle', 'danger']].map(([l, v, ic, va]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-base-200)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 16,
    color: `var(--color-${va})`
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 13,
      color: 'var(--color-fg-muted)'
    }
  }, l), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, v)))))));
}
function Metric({
  label,
  value,
  icon,
  trend,
  delta,
  foot
}) {
  const up = trend === 'up';
  return /*#__PURE__*/React.createElement(Card, {
    pad: 18
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--color-fg-muted)',
      fontWeight: 500
    }
  }, label), /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 18,
    color: "var(--color-fg-subtle)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 26,
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      color: 'var(--color-fg)'
    }
  }, value), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: up ? 'var(--color-success)' : 'var(--color-danger)'
    }
  }, up ? '▲' : '▼', " ", delta)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--color-fg-muted)',
      marginTop: 8
    }
  }, foot));
}
window.LoginScreen = LoginScreen;
window.Dashboard = Dashboard;
window.BRL = BRL;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/screens-main.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/screens-onboarding.jsx
try { (() => {
/* HiperTMS app UI-kit — Onboarding wizard ("Configuração da operação"). */
const {
  useState: useOb
} = React;
const OB_STEPS = [{
  id: 'empresa',
  title: 'Sua empresa',
  desc: 'Comece pelos dados da transportadora.',
  icon: 'building-2'
}, {
  id: 'distancias',
  title: 'Faixas de distância',
  desc: 'Define os intervalos de km para cálculo de frete.',
  icon: 'route'
}, {
  id: 'margens',
  title: 'Margem alvo',
  desc: 'Quanto você quer ganhar, em média, por frete.',
  icon: 'trending-up'
}, {
  id: 'resumo',
  title: 'Tudo pronto',
  desc: 'Revise e comece a cotar.',
  icon: 'check-circle-2'
}];
function Onboarding({
  onFinish
}) {
  const [step, setStep] = useOb(0);
  const [margin, setMargin] = useOb(35);
  const total = OB_STEPS.length;
  const s = OB_STEPS[step];
  const last = step === total - 1;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: 'linear-gradient(160deg, var(--color-base-200), var(--color-primary-50) 60%, var(--color-base-200))'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 720,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-surface-raised)',
      borderRadius: 'var(--radius-3xl)',
      boxShadow: 'var(--shadow-elevated)',
      border: '1px solid var(--color-surface-border)',
      overflow: 'hidden',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '22px 28px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/hipertms-wordmark.svg",
    alt: "HiperTMS",
    style: {
      height: 24
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--color-fg-subtle)',
      fontWeight: 500
    }
  }, "Passo ", step + 1, " de ", total)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginTop: 14
    }
  }, OB_STEPS.map((_, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      height: 4,
      flex: 1,
      borderRadius: 'var(--radius-full)',
      background: i <= step ? 'var(--color-primary)' : 'var(--color-base-300)',
      transition: 'background .4s'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '28px 32px',
      minHeight: 280
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 48,
      height: 48,
      flexShrink: 0,
      borderRadius: 'var(--radius-2xl)',
      background: 'var(--color-primary-100)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: s.icon,
    size: 24,
    color: "var(--color-primary-700)"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--color-fg)',
      margin: 0
    }
  }, s.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--color-fg-muted)',
      marginTop: 3
    }
  }, s.desc))), step === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(ObField, {
    label: "Raz\xE3o social",
    value: "Transportadora Rota Sul Ltda"
  }), /*#__PURE__*/React.createElement(ObField, {
    label: "CNPJ",
    value: "12.345.678/0001-90"
  }), /*#__PURE__*/React.createElement(ObField, {
    label: "Cidade / UF",
    value: "Itaja\xED / SC"
  }), /*#__PURE__*/React.createElement(ObSelect, {
    label: "Regime tribut\xE1rio",
    options: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real']
  })), step === 1 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, [['0 – 150 km', 'Regional', true], ['151 – 300 km', 'Interestadual curto', true], ['301 – 500 km', 'Interestadual médio', true], ['501 – 1000 km', 'Interestadual', false]].map(([r, d, on]) => /*#__PURE__*/React.createElement("label", {
    key: r,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 14px',
      borderRadius: 'var(--radius-xl)',
      border: `2px solid ${on ? 'var(--color-primary)' : 'var(--color-surface-border)'}`,
      background: on ? 'var(--color-primary-50)' : 'var(--color-surface-raised)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(ObCheck, {
    on: on
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, r), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--color-fg-muted)'
    }
  }, d))))), step === 2 && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-fg)'
    }
  }, "Margem alvo padr\xE3o"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 22,
      fontWeight: 700,
      color: 'var(--color-primary)'
    }
  }, margin, "%")), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: "5",
    max: "60",
    value: margin,
    onChange: e => setMargin(+e.target.value),
    style: {
      width: '100%',
      accentColor: 'var(--color-primary)'
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--color-fg-muted)',
      marginTop: 12
    }
  }, "Aplicada por padr\xE3o a novas cota\xE7\xF5es. Voc\xEA pode ajustar por cliente ou rota depois.")), step === 3 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, [['Empresa cadastrada', 'Transportadora Rota Sul Ltda'], ['4 faixas de distância', 'até 1000 km'], ['Margem alvo', margin + '%'], ['Tabela nacional modelo', 'carregada']].map(([t, v]) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 14px',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--color-success-tint)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 18,
    color: "var(--color-success-ink)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-success-ink)'
    }
  }, t), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--color-success-ink)'
    }
  }, v))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 28px',
      borderTop: '1px solid var(--color-surface-border)'
    }
  }, /*#__PURE__*/React.createElement("div", null, step > 0 && /*#__PURE__*/React.createElement(Btn, {
    variant: "ghost",
    onClick: () => setStep(step - 1),
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "arrow-left",
      size: 16
    })
  }, "Voltar")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, !last && /*#__PURE__*/React.createElement(Btn, {
    variant: "ghost",
    onClick: () => setStep(step + 1)
  }, "Pular"), /*#__PURE__*/React.createElement(Btn, {
    variant: "primary",
    size: "lg",
    onClick: () => last ? onFinish?.() : setStep(step + 1),
    iconRight: !last ? /*#__PURE__*/React.createElement(Icon, {
      name: "arrow-right",
      size: 16,
      color: "var(--color-primary-content)"
    }) : null
  }, last ? 'Concluir e cotar' : 'Continuar')))));
}
function ObField({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-fg)'
    }
  }, label), /*#__PURE__*/React.createElement("input", {
    defaultValue: value,
    style: {
      height: 38,
      border: '1px solid var(--color-surface-border)',
      borderRadius: 'var(--radius-md)',
      padding: '0 12px',
      fontSize: 14,
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-fg)',
      background: 'var(--color-surface-raised)',
      outline: 'none'
    }
  }));
}
function ObSelect({
  label,
  options
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-fg)'
    }
  }, label), /*#__PURE__*/React.createElement("select", {
    style: {
      height: 38,
      border: '1px solid var(--color-surface-border)',
      borderRadius: 'var(--radius-md)',
      padding: '0 10px',
      fontSize: 14,
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-fg)',
      background: 'var(--color-surface-raised)'
    }
  }, options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o
  }, o))));
}
function ObCheck({
  on
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 20,
      borderRadius: 'var(--radius-sm)',
      border: on ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
      background: on ? 'var(--color-primary)' : 'var(--color-surface-raised)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, on && /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 13,
    color: "var(--color-primary-content)"
  }));
}
window.Onboarding = Onboarding;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/screens-onboarding.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/screens-ops.jsx
try { (() => {
/* HiperTMS app UI-kit — Operação: Embarques (list + detail) and Viagens. */
const {
  useState: useOp
} = React;
const SHIPMENTS = [['EMB-2025-1188', 'Brasil Foods S/A', 'São Paulo / SP', 'Curitiba / PR', 'Truck 14t · ABC-1D23', 'em_transito', '12/06'], ['EMB-2025-1187', 'Agro Triângulo', 'Uberlândia / MG', 'Goiânia / GO', 'Carreta 27t · QRS-7H88', 'pendente', '13/06'], ['EMB-2025-1186', 'Distribuidora Náutica', 'Itajaí / SC', 'Florianópolis / SC', 'VUC 3t · MNO-4F55', 'entregue', '10/06'], ['EMB-2025-1185', 'Móveis Bento', 'Bento Gonçalves / RS', 'São Paulo / SP', 'Carreta 27t · JKL-9G11', 'em_transito', '11/06'], ['EMB-2025-1184', 'TecnoPeças Ltda', 'Joinville / SC', 'Campinas / SP', 'Truck 14t · ABC-1D23', 'pendente', '14/06']];
function Embarques({
  onOpen
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Embarques",
    desc: "Acompanhe coletas, tr\xE2nsito e entregas \u2014 com ve\xEDculo e motorista a um clique.",
    action: /*#__PURE__*/React.createElement(Btn, {
      variant: "primary",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "plus",
        size: 16,
        color: "var(--color-primary-content)"
      })
    }, "Novo embarque")
  }), /*#__PURE__*/React.createElement(FilterBar, {
    placeholder: "Buscar embarque, cliente ou placa\u2026"
  }), /*#__PURE__*/React.createElement(Card, {
    pad: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: 'var(--color-base-200)'
    }
  }, ['Embarque', 'Cliente', 'Rota', 'Veículo · placa', 'Coleta', 'Status'].map((h, i) => /*#__PURE__*/React.createElement(Th, {
    key: i,
    right: false
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, SHIPMENTS.map((s, i) => /*#__PURE__*/React.createElement(ShipRow, {
    key: s[0],
    s: s,
    last: i === SHIPMENTS.length - 1,
    onClick: () => onOpen(s)
  }))))));
}
function ShipRow({
  s,
  last,
  onClick
}) {
  const [num, cli, ori, dest, veic, st, coleta] = s;
  const [h, setH] = useOp(false);
  return /*#__PURE__*/React.createElement("tr", {
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    onClick: onClick,
    style: {
      borderBottom: last ? 'none' : '1px solid var(--color-surface-border)',
      background: h ? 'var(--color-base-200)' : 'transparent',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Td, {
    mono: true,
    bold: true
  }, num), /*#__PURE__*/React.createElement(Td, null, cli), /*#__PURE__*/React.createElement(Td, {
    muted: true
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, ori, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 12,
    color: "var(--color-fg-subtle)"
  }), dest)), /*#__PURE__*/React.createElement(Td, {
    muted: true
  }, veic), /*#__PURE__*/React.createElement(Td, {
    mono: true,
    muted: true
  }, coleta), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px'
    }
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    status: st
  })));
}
const TIMELINE = [['Cotação aprovada', '08/06 · 14:22', 'aprovada', true], ['Embarque criado', '09/06 · 09:10', 'pendente', true], ['Coleta realizada', '12/06 · 07:48', 'em_transito', true], ['Em trânsito', 'agora', 'em_transito', true], ['Entrega prevista', '13/06', 'entregue', false]];
function EmbarqueDetail({
  s,
  onBack
}) {
  const [num, cli, ori, dest, veic, st] = s;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Btn, {
    variant: "ghost",
    size: "icon",
    onClick: onBack
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-left",
    size: 18
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 23,
      fontWeight: 700,
      margin: 0,
      color: 'var(--color-fg)'
    }
  }, num), /*#__PURE__*/React.createElement(StatusBadge, {
    status: st
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--color-fg-muted)',
      marginTop: 3
    }
  }, cli, " \xB7 ", ori, " \u2192 ", dest))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Btn, {
    variant: "outline",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "file-text",
      size: 15
    })
  }, "Gerar CT-e"), /*#__PURE__*/React.createElement(Btn, {
    variant: "outline",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "printer",
      size: 15
    })
  }, "Romaneio"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.4fr 1fr',
      gap: 18,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Section, {
    title: "Remetente e destinat\xE1rio"
  }, /*#__PURE__*/React.createElement(Group, {
    cols: 2
  }, /*#__PURE__*/React.createElement(FieldKV, {
    label: "Remetente",
    value: "Brasil Foods S/A"
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "CNPJ remetente",
    value: "01.234.567/0001-89",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Destinat\xE1rio",
    value: "Atacad\xE3o Curitiba"
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Cidade de entrega",
    value: "Curitiba / PR"
  }))), /*#__PURE__*/React.createElement(Section, {
    title: "Carga"
  }, /*#__PURE__*/React.createElement(Group, {
    cols: 3
  }, /*#__PURE__*/React.createElement(FieldKV, {
    label: "Peso",
    value: "12.400 kg",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Volumes",
    value: "320",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Valor da carga",
    value: "R$ 184.500,00",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Produto predominante",
    value: "Alimentos"
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Dist\xE2ncia",
    value: "408 km",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Frete-valor",
    value: "R$ 4.000,00",
    mono: true
  }))), /*#__PURE__*/React.createElement(Section, {
    title: "Ve\xEDculo e motorista"
  }, /*#__PURE__*/React.createElement(Group, {
    cols: 2
  }, /*#__PURE__*/React.createElement(FieldKV, {
    label: "Ve\xEDculo",
    value: veic
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Motorista",
    value: "Jos\xE9 Aparecido"
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "Telefone",
    value: "(41) 99876-5432",
    mono: true
  }), /*#__PURE__*/React.createElement(FieldKV, {
    label: "CT-e vinculado",
    value: "CT-e N\xBA 4821",
    link: true
  })))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, "Linha do tempo"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      display: 'flex',
      flexDirection: 'column'
    }
  }, TIMELINE.map(([label, time, st, done], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 12,
      height: 12,
      borderRadius: '50%',
      background: done ? 'var(--color-primary)' : 'var(--color-base-300)',
      border: done ? 'none' : '2px solid var(--color-surface-border)',
      flexShrink: 0,
      marginTop: 2
    }
  }), i < TIMELINE.length - 1 && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 2,
      flex: 1,
      minHeight: 26,
      background: done ? 'var(--color-primary)' : 'var(--color-base-300)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: done ? 'var(--color-fg)' : 'var(--color-fg-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--color-fg-subtle)',
      marginTop: 1,
      fontFamily: 'var(--font-mono)'
    }
  }, time))))))));
}

/* ---- Viagens ---- */
const TRIPS = [['VIA-2025-0342', 'SP → Curitiba → Joinville', 'José Aparecido', 'Carreta 27t', 612, 2.84, 'em_transito', '+R$ 2.180'], ['VIA-2025-0341', 'Uberlândia → Goiânia', 'Carla Mendes', 'Truck 14t', 312, 3.10, 'pendente', '+R$ 742'], ['VIA-2025-0340', 'Itajaí → Floripa → Tubarão', 'Rui Barros', 'VUC 3t', 268, 3.55, 'encerrado', '+R$ 410'], ['VIA-2025-0339', 'Bento → SP', 'Anderson Reis', 'Carreta 27t', 870, 2.62, 'em_transito', '+R$ 1.980']];
function Viagens() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Viagens",
    desc: "Receita vs. custo/km em cada viagem \u2014 enxergue a margem antes de rodar.",
    action: /*#__PURE__*/React.createElement(Btn, {
      variant: "primary",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "plus",
        size: 16,
        color: "var(--color-primary-content)"
      })
    }, "Nova viagem")
  }), /*#__PURE__*/React.createElement(FilterBar, {
    placeholder: "Buscar viagem, motorista ou rota\u2026"
  }), /*#__PURE__*/React.createElement(Card, {
    pad: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: 'var(--color-base-200)'
    }
  }, /*#__PURE__*/React.createElement(Th, null, "Viagem"), /*#__PURE__*/React.createElement(Th, null, "Rota / paradas"), /*#__PURE__*/React.createElement(Th, null, "Motorista"), /*#__PURE__*/React.createElement(Th, null, "Ve\xEDculo"), /*#__PURE__*/React.createElement(Th, {
    right: true
  }, "Dist\xE2ncia"), /*#__PURE__*/React.createElement(Th, {
    right: true
  }, "Custo/km"), /*#__PURE__*/React.createElement(Th, {
    right: true
  }, "Lucro est."), /*#__PURE__*/React.createElement(Th, null, "Status"))), /*#__PURE__*/React.createElement("tbody", null, TRIPS.map((t, i) => {
    const [num, rota, mot, veic, km, ckm, st, lucro] = t;
    return /*#__PURE__*/React.createElement(TripRow, {
      key: num,
      num: num,
      rota: rota,
      mot: mot,
      veic: veic,
      km: km,
      ckm: ckm,
      st: st,
      lucro: lucro,
      last: i === TRIPS.length - 1
    });
  })))));
}
function TripRow({
  num,
  rota,
  mot,
  veic,
  km,
  ckm,
  st,
  lucro,
  last
}) {
  const [h, setH] = useOp(false);
  return /*#__PURE__*/React.createElement("tr", {
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      borderBottom: last ? 'none' : '1px solid var(--color-surface-border)',
      background: h ? 'var(--color-base-200)' : 'transparent',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Td, {
    mono: true,
    bold: true
  }, num), /*#__PURE__*/React.createElement(Td, null, rota), /*#__PURE__*/React.createElement(Td, {
    muted: true
  }, mot), /*#__PURE__*/React.createElement(Td, {
    muted: true
  }, veic), /*#__PURE__*/React.createElement(Td, {
    mono: true,
    right: true
  }, km, " km"), /*#__PURE__*/React.createElement(Td, {
    mono: true,
    right: true
  }, "R$ ", ckm.toFixed(2)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px',
      textAlign: 'right',
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--color-success)'
    }
  }, lucro), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px'
    }
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    status: st
  })));
}

/* ---- shared bits ---- */
function PageHead({
  title,
  desc,
  action
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--color-fg)',
      margin: 0
    }
  }, title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--color-fg-muted)',
      marginTop: 4
    }
  }, desc)), action);
}
function FilterBar({
  placeholder
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      maxWidth: 340,
      height: 36,
      border: '1px solid var(--color-surface-border)',
      borderRadius: 'var(--radius-md)',
      padding: '0 12px',
      background: 'var(--color-surface-raised)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 16,
    color: "var(--color-fg-subtle)"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: placeholder,
    style: {
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontSize: 14,
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-fg)',
      width: '100%'
    }
  })), /*#__PURE__*/React.createElement(Btn, {
    variant: "outline",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "sliders-horizontal",
      size: 15
    })
  }, "Filtros"), /*#__PURE__*/React.createElement(Btn, {
    variant: "outline",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "download",
      size: 15
    })
  }, "Exportar"));
}
function Th({
  children,
  right
}) {
  return /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: right ? 'right' : 'left',
      padding: '11px 16px',
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '.05em',
      color: 'var(--color-fg-subtle)',
      whiteSpace: 'nowrap'
    }
  }, children);
}
function Td({
  children,
  mono,
  bold,
  muted,
  right
}) {
  return /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px',
      textAlign: right ? 'right' : 'left',
      fontSize: 13,
      fontFamily: mono ? 'var(--font-mono)' : 'inherit',
      fontWeight: bold ? 600 : 400,
      color: muted ? 'var(--color-fg-muted)' : 'var(--color-fg)',
      whiteSpace: 'nowrap'
    }
  }, children);
}
function Section({
  title,
  children
}) {
  return /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, children));
}
function Group({
  cols,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: `repeat(${cols},1fr)`,
      gap: '14px 20px'
    }
  }, children);
}
function FieldKV({
  label,
  value,
  mono,
  link
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--color-fg-subtle)',
      textTransform: 'uppercase',
      letterSpacing: '.04em',
      fontWeight: 600
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      marginTop: 3,
      fontFamily: mono ? 'var(--font-mono)' : 'inherit',
      color: link ? 'var(--color-primary)' : 'var(--color-fg)',
      fontWeight: link ? 600 : 400,
      cursor: link ? 'pointer' : 'default'
    }
  }, value));
}
Object.assign(window, {
  Embarques,
  EmbarqueDetail,
  Viagens,
  PageHead,
  FilterBar,
  KitTh: Th,
  KitTd: Td,
  Section,
  Group,
  FieldKV
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/screens-ops.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/screens-quotes.jsx
try { (() => {
/* HiperTMS app UI-kit — Cotações list + Nova cotação. */
const {
  useState: useSt
} = React;
const QUOTES = [['COT-2025-0481', 'Brasil Foods S/A', 'São Paulo / SP', 'Curitiba / PR', 408, 4863.64, 1355.19, 'aprovada'], ['COT-2025-0480', 'Agro Triângulo', 'Uberlândia / MG', 'Goiânia / GO', 312, 3120.00, 742.10, 'enviada'], ['COT-2025-0479', 'Móveis Bento', 'Bento Gonçalves / RS', 'São Paulo / SP', 870, 7980.40, 1980.55, 'em_cotacao'], ['COT-2025-0478', 'Distribuidora Náutica', 'Itajaí / SC', 'Florianópolis / SC', 96, 1280.00, 410.32, 'aprovada'], ['COT-2025-0477', 'Cerâmica Sul', 'Criciúma / SC', 'Porto Alegre / RS', 360, 3540.00, 612.00, 'rejeitada'], ['COT-2025-0476', 'TecnoPeças Ltda', 'Joinville / SC', 'Campinas / SP', 612, 5910.20, 1488.90, 'convertida']];
function QuotesList({
  onNova
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--color-fg)',
      margin: 0
    }
  }, "Cota\xE7\xF5es"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--color-fg-muted)',
      marginTop: 4
    }
  }, "Precifique, envie e acompanhe seus fretes \u2014 margem vis\xEDvel em cada linha.")), /*#__PURE__*/React.createElement(Btn, {
    variant: "primary",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "plus",
      size: 16,
      color: "var(--color-primary-content)"
    }),
    onClick: onNova
  }, "Nova cota\xE7\xE3o")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      maxWidth: 320,
      height: 36,
      border: '1px solid var(--color-surface-border)',
      borderRadius: 'var(--radius-md)',
      padding: '0 12px',
      background: 'var(--color-surface-raised)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 16,
    color: "var(--color-fg-subtle)"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Buscar cliente, n\xFAmero ou rota\u2026",
    style: {
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontSize: 14,
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-fg)',
      width: '100%'
    }
  })), /*#__PURE__*/React.createElement(Btn, {
    variant: "outline",
    size: "md",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "sliders-horizontal",
      size: 15
    })
  }, "Filtros"), /*#__PURE__*/React.createElement(Btn, {
    variant: "outline",
    size: "md",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "download",
      size: 15
    })
  }, "Exportar")), /*#__PURE__*/React.createElement(Card, {
    pad: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: 'var(--color-base-200)'
    }
  }, ['Cotação', 'Cliente', 'Rota', 'Distância', 'Total', 'Margem', 'Status', ''].map((h, i) => /*#__PURE__*/React.createElement("th", {
    key: i,
    style: {
      textAlign: i >= 3 && i <= 5 ? 'right' : 'left',
      padding: '11px 16px',
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '.05em',
      color: 'var(--color-fg-subtle)',
      whiteSpace: 'nowrap'
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, QUOTES.map((q, idx) => /*#__PURE__*/React.createElement(QuoteRow, {
    key: q[0],
    q: q,
    last: idx === QUOTES.length - 1
  }))))));
}
function QuoteRow({
  q,
  last
}) {
  const [num, cliente, ori, dest, km, total, margem, st] = q;
  const [h, setH] = useSt(false);
  return /*#__PURE__*/React.createElement("tr", {
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      borderBottom: last ? 'none' : '1px solid var(--color-surface-border)',
      background: h ? 'var(--color-base-200)' : 'transparent',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px',
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, num), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px',
      fontSize: 13,
      color: 'var(--color-fg)'
    }
  }, cliente), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px',
      fontSize: 12,
      color: 'var(--color-fg-muted)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, ori, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 12,
    color: "var(--color-fg-subtle)"
  }), dest)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px',
      textAlign: 'right',
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      color: 'var(--color-fg-muted)'
    }
  }, km, " km"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px',
      textAlign: 'right',
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, BRL(total)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px',
      textAlign: 'right',
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--color-success)'
    }
  }, "+", BRL(margem)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px'
    }
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    status: st
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 16px',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more-horizontal",
    size: 16,
    color: "var(--color-fg-subtle)"
  })));
}

/* ====================== NOVA COTAÇÃO ====================== */
function NovaCotacao({
  onBack
}) {
  const [km, setKm] = useSt(408);
  const [margemPct, setMargemPct] = useSt(35);
  const frete = Math.round(km * 9.8 * 100) / 100;
  const taxas = 100,
    pedagio = Math.round(km * 0.44 * 100) / 100;
  const icms = Math.round((frete + taxas + pedagio) * 0.12 * 100) / 100;
  const totalBruto = frete + taxas + pedagio + icms;
  const custos = Math.round(totalBruto * (1 - margemPct / 100) * 0.62 * 100) / 100;
  const impostos = icms + Math.round(frete * 0.0365 * 100) / 100;
  const margem = Math.max(0, totalBruto - impostos - custos);
  const rows = [['Frete (SP → Curitiba)', frete], ['Taxas e ad valorem', taxas], ['Pedágio', pedagio], ['ICMS (12% por dentro)', icms]];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Btn, {
    variant: "ghost",
    size: "icon",
    onClick: onBack
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-left",
    size: 18
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--color-fg)',
      margin: 0
    }
  }, "Nova cota\xE7\xE3o"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--color-fg-muted)',
      marginTop: 3
    }
  }, "Monte o frete com imposto, custo e margem \u2014 item a item."))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.3fr 1fr',
      gap: 18,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, "Dados do frete"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 14,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(FormField, {
    label: "Cliente",
    value: "Brasil Foods S/A"
  }), /*#__PURE__*/React.createElement(FormSelect, {
    label: "Tipo de opera\xE7\xE3o",
    options: ['Intermunicipal', 'Municipal']
  }), /*#__PURE__*/React.createElement(FormField, {
    label: "Origem",
    value: "S\xE3o Paulo / SP"
  }), /*#__PURE__*/React.createElement(FormField, {
    label: "Destino",
    value: "Curitiba / PR"
  }), /*#__PURE__*/React.createElement(FormSelect, {
    label: "Ve\xEDculo",
    options: ['Truck 14t', 'Carreta 27t', 'VUC 3t']
  }), /*#__PURE__*/React.createElement(FormSlider, {
    label: "Dist\xE2ncia",
    value: km,
    suffix: "km",
    min: 50,
    max: 1200,
    onChange: setKm
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--color-surface-border)',
      margin: '18px 0'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, "Margem e adicionais"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 14,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(FormSlider, {
    label: "Margem alvo",
    value: margemPct,
    suffix: "%",
    min: 5,
    max: 60,
    onChange: setMargemPct
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 9,
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 9,
      fontSize: 13,
      color: 'var(--color-fg)'
    }
  }, /*#__PURE__*/React.createElement(Check, {
    on: true
  }), " Incluir ped\xE1gio"), /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 9,
      fontSize: 13,
      color: 'var(--color-fg)'
    }
  }, /*#__PURE__*/React.createElement(Check, {
    on: true
  }), " Seguro (ad valorem)")))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 'var(--radius-3xl)',
      padding: 14,
      background: 'linear-gradient(135deg,#FF5A1F,#ED4708 45%,#1E3A5F)',
      boxShadow: '0 24px 56px -18px rgba(255,90,31,.3)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--color-surface-raised)',
      borderRadius: 'calc(var(--radius-3xl) - 12px)',
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, "Resumo da cota\xE7\xE3o"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--color-fg-muted)',
      marginTop: 2
    }
  }, "Impostos, custos e margem com clareza.")), /*#__PURE__*/React.createElement(Badge, {
    variant: "success"
  }, "+", BRL(margem))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 9,
      marginTop: 18,
      fontSize: 13
    }
  }, rows.map(([l, v]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      color: 'var(--color-fg-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", null, l), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontWeight: 500,
      color: 'var(--color-fg)'
    }
  }, BRL(v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      borderTop: '1px solid var(--color-surface-border)',
      paddingTop: 11,
      marginTop: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      color: 'var(--color-fg)'
    }
  }, "Total bruto"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontWeight: 700,
      color: 'var(--color-fg)'
    }
  }, BRL(totalBruto)))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid var(--color-surface-border)',
      marginTop: 16,
      paddingTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '.12em',
      color: 'var(--color-fg-subtle)',
      marginBottom: 10
    }
  }, "An\xE1lise cr\xEDtica"), [['Impostos total', impostos, 'var(--color-fg)'], ['Custos operacionais', custos, 'var(--color-fg)'], ['Margem', margem, 'var(--color-success)']].map(([l, v, c]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 12,
      marginBottom: 7,
      color: 'var(--color-fg-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", null, l), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontWeight: 600,
      color: c
    }
  }, BRL(v))))), /*#__PURE__*/React.createElement(Btn, {
    variant: "primary",
    size: "lg",
    style: {
      width: '100%',
      marginTop: 18
    }
  }, "Salvar e enviar cota\xE7\xE3o")))));
}
function FormField({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-fg)'
    }
  }, label), /*#__PURE__*/React.createElement("input", {
    defaultValue: value,
    style: {
      height: 36,
      border: '1px solid var(--color-surface-border)',
      borderRadius: 'var(--radius-md)',
      padding: '0 12px',
      fontSize: 14,
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-fg)',
      background: 'var(--color-surface-raised)',
      outline: 'none'
    }
  }));
}
function FormSelect({
  label,
  options
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-fg)'
    }
  }, label), /*#__PURE__*/React.createElement("select", {
    style: {
      height: 36,
      border: '1px solid var(--color-surface-border)',
      borderRadius: 'var(--radius-md)',
      padding: '0 10px',
      fontSize: 14,
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-fg)',
      background: 'var(--color-surface-raised)',
      outline: 'none'
    }
  }, options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o
  }, o))));
}
function FormSlider({
  label,
  value,
  suffix,
  min,
  max,
  onChange
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-fg)',
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, label, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      color: 'var(--color-primary)',
      fontWeight: 600
    }
  }, value, suffix)), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: min,
    max: max,
    value: value,
    onChange: e => onChange(+e.target.value),
    style: {
      accentColor: 'var(--color-primary)',
      height: 36
    }
  }));
}
function Check({
  on
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      width: 18,
      height: 18,
      borderRadius: 'var(--radius-sm)',
      border: on ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
      background: on ? 'var(--color-primary)' : 'var(--color-surface-raised)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, on && /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 12,
    color: "var(--color-primary-content)"
  }));
}
window.QuotesList = QuotesList;
window.NovaCotacao = NovaCotacao;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/screens-quotes.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/shell.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* HiperTMS app UI-kit — shared primitives + shell.
   Self-contained (token-driven) cosmetic versions of the design-system
   components, plus the dark sidebar + top bar shell. Exported to window. */

const {
  useState,
  useEffect,
  useRef
} = React;

/* ---- Lucide icon helper (CDN) ---- */
function Icon({
  name,
  size = 18,
  color = 'currentColor',
  strokeWidth = 1.9,
  style = {}
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = '';
      const el = document.createElement('i');
      el.setAttribute('data-lucide', name);
      ref.current.appendChild(el);
      window.lucide.createIcons({
        attrs: {
          width: size,
          height: size,
          'stroke-width': strokeWidth
        }
      });
    }
  }, [name, size, strokeWidth]);
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    style: {
      display: 'inline-flex',
      color,
      lineHeight: 0,
      ...style
    },
    "aria-hidden": true
  });
}

/* ---- Button ---- */
function Btn({
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  children,
  style = {},
  ...p
}) {
  const [h, setH] = useState(false);
  const sizes = {
    sm: {
      height: 32,
      padding: '0 12px',
      fontSize: 13
    },
    md: {
      height: 36,
      padding: '0 16px',
      fontSize: 14
    },
    lg: {
      height: 42,
      padding: '0 22px',
      fontSize: 15
    },
    icon: {
      height: 36,
      width: 36,
      padding: 0,
      fontSize: 14
    }
  }[size] || {};
  const variants = {
    primary: {
      background: h ? 'var(--color-primary-dark)' : 'var(--color-primary)',
      color: 'var(--color-primary-content)',
      border: '1px solid transparent',
      boxShadow: 'var(--shadow-soft)'
    },
    outline: {
      background: h ? 'var(--color-base-200)' : 'var(--color-surface-raised)',
      color: 'var(--color-fg)',
      border: '1px solid var(--color-surface-border)'
    },
    ghost: {
      background: h ? 'var(--color-base-200)' : 'transparent',
      color: 'var(--color-fg)',
      border: '1px solid transparent'
    },
    secondary: {
      background: h ? 'var(--color-base-300)' : 'var(--color-base-200)',
      color: 'var(--color-fg)',
      border: '1px solid transparent'
    }
  }[variant] || {};
  return /*#__PURE__*/React.createElement("button", _extends({
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderRadius: 'var(--radius-md)',
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      transition: 'background .15s',
      outline: 'none',
      ...sizes,
      ...variants,
      ...style
    }
  }, p), iconLeft, children, iconRight);
}

/* ---- Badge / StatusBadge ---- */
const STATUS = {
  rascunho: ['Rascunho', 'neutral'],
  em_cotacao: ['Em cotação', 'primary'],
  enviada: ['Enviada', 'info'],
  aprovada: ['Aprovada', 'success'],
  rejeitada: ['Rejeitada', 'danger'],
  convertida: ['Convertida', 'info'],
  pendente: ['Pendente', 'warning'],
  em_transito: ['Em trânsito', 'primary'],
  entregue: ['Entregue', 'success'],
  cancelado: ['Cancelado', 'danger'],
  autorizado: ['Autorizado', 'success'],
  processando: ['Processando', 'warning'],
  encerrado: ['Encerrado', 'neutral']
};
const TINT = {
  neutral: ['var(--color-neutral-tint)', 'var(--color-neutral-ink)'],
  primary: ['var(--color-primary-100)', 'var(--color-primary-700)'],
  success: ['var(--color-success-tint)', 'var(--color-success-ink)'],
  warning: ['var(--color-warning-tint)', 'var(--color-warning-ink)'],
  danger: ['var(--color-danger-tint)', 'var(--color-danger-ink)'],
  info: ['var(--color-info-tint)', 'var(--color-info-ink)']
};
const DOT = {
  neutral: 'var(--color-neutral-ink)',
  primary: 'var(--color-primary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  info: 'var(--color-info)'
};
function Badge({
  variant = 'neutral',
  children,
  dot = false,
  style = {}
}) {
  const [bg, ink] = TINT[variant] || TINT.neutral;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 10px',
      borderRadius: 'var(--radius-full)',
      background: bg,
      color: ink,
      fontSize: 12,
      fontWeight: 600,
      fontFamily: 'var(--font-sans)',
      whiteSpace: 'nowrap',
      ...style
    }
  }, dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: DOT[variant]
    }
  }), children);
}
function StatusBadge({
  status
}) {
  const [label, variant] = STATUS[status] || [status, 'neutral'];
  return /*#__PURE__*/React.createElement(Badge, {
    variant: variant,
    dot: true
  }, label);
}

/* ---- Card ---- */
function Card({
  children,
  style = {},
  pad = 20,
  ...p
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--color-surface-raised)',
      border: '1px solid var(--color-surface-border)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-card)',
      padding: pad,
      ...style
    }
  }, p), children);
}

/* ---- App shell: sidebar + top bar ---- */
const NAV_QUICK = [['Cotações', 'file-text'], ['Embarques', 'truck'], ['Cargas', 'clipboard-list'], ['Viagens', 'map'], ['CT-e', 'file-check-2'], ['MDF-e', 'copy']];
const NAV_HUBS = [['Painel', 'layout-dashboard'], ['Vendas', 'trending-up'], ['Operação', 'package'], ['Frota', 'truck'], ['Financeiro', 'wallet'], ['Fiscal', 'receipt']];
const NAV_SYSTEM = [['Config. operação', 'sliders-horizontal'], ['Admin · Preços', 'shield-check']];
function Sidebar({
  active,
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 224,
      flexShrink: 0,
      background: 'var(--color-sidebar-bg)',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid var(--color-sidebar-border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      borderBottom: '1px solid var(--color-sidebar-border)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/hipertms-wordmark-dark.svg",
    alt: "HiperTMS",
    style: {
      height: 26
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '14px 10px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '.1em',
      textTransform: 'uppercase',
      color: 'var(--color-sidebar-section)',
      padding: '0 8px 8px'
    }
  }, "Acesso r\xE1pido"), NAV_QUICK.map(([label, icon]) => /*#__PURE__*/React.createElement(NavRow, {
    key: label,
    label: label,
    icon: icon,
    active: active === label,
    onClick: () => onNavigate(label)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--color-sidebar-border)',
      margin: '12px 8px'
    }
  }), NAV_HUBS.map(([label, icon]) => /*#__PURE__*/React.createElement(NavRow, {
    key: label,
    label: label,
    icon: icon,
    active: active === label,
    onClick: () => onNavigate(label)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '.1em',
      textTransform: 'uppercase',
      color: 'var(--color-sidebar-section)',
      padding: '14px 8px 8px'
    }
  }, "Sistema"), NAV_SYSTEM.map(([label, icon]) => /*#__PURE__*/React.createElement(NavRow, {
    key: label,
    label: label,
    icon: icon,
    active: active === label,
    onClick: () => onNavigate(label)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 18px',
      borderTop: '1px solid var(--color-sidebar-border)',
      fontSize: 10,
      color: 'var(--color-sidebar-section)'
    }
  }, "HiperTMS v12"));
}
function NavRow({
  label,
  icon,
  active,
  onClick
}) {
  const [h, setH] = useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      padding: '8px 10px',
      marginBottom: 1,
      borderRadius: 'var(--radius-lg)',
      border: 'none',
      cursor: 'pointer',
      textAlign: 'left',
      fontFamily: 'var(--font-sans)',
      fontSize: 13,
      background: active ? 'var(--color-sidebar-active)' : h ? 'var(--color-sidebar-hover)' : 'transparent',
      color: active ? 'var(--color-sidebar-text-active)' : h ? 'var(--color-sidebar-text-hover)' : 'var(--color-sidebar-text)',
      fontWeight: active ? 600 : 500,
      position: 'relative'
    }
  }, active && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 0,
      width: 6,
      display: 'flex',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--color-sidebar-icon-accent)'
    }
  })), /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 18,
    color: active ? 'var(--color-sidebar-icon-accent)' : 'currentColor'
  }), label);
}
function useDarkMode() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('hipertms_theme', next ? 'dark' : 'light');
    } catch (e) {}
    setDark(next);
  };
  return [dark, toggle];
}
function TopBar({
  title
}) {
  const [dark, toggleDark] = useDarkMode();
  const [hov, setHov] = useState(false);
  return /*#__PURE__*/React.createElement("header", {
    style: {
      height: 56,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 22px',
      borderBottom: '1px solid var(--color-surface-border)',
      background: 'var(--color-surface-raised)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--color-fg-muted)',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--color-fg)',
      fontWeight: 600
    }
  }, title)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--color-fg-muted)'
    }
  }, "Transportadora Rota Sul"), /*#__PURE__*/React.createElement("button", {
    onClick: toggleDark,
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
    "aria-label": "Alternar tema",
    title: dark ? 'Tema claro' : 'Tema escuro',
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 32,
      height: 32,
      borderRadius: 'var(--radius-md)',
      border: 'none',
      cursor: 'pointer',
      background: hov ? 'var(--color-base-200)' : 'transparent',
      color: 'var(--color-fg-subtle)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: dark ? 'sun' : 'moon',
    size: 18
  })), /*#__PURE__*/React.createElement(Icon, {
    name: "bell",
    size: 18,
    color: "var(--color-fg-subtle)"
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "message-circle",
    size: 18,
    color: "var(--color-fg-subtle)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: '50%',
      background: 'var(--color-navy)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 700
    }
  }, "MR")));
}
Object.assign(window, {
  Icon,
  Btn,
  Badge,
  StatusBadge,
  Card,
  Sidebar,
  TopBar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/sections.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* HiperTMS marketing landing — sections. Self-contained, token-driven. */
const {
  useState: useMS
} = React;
function useMktDark() {
  const [dark, setDark] = useMS(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('hipertms_theme', next ? 'dark' : 'light');
    } catch (e) {}
    setDark(next);
  };
  return [dark, toggle];
}
function MIcon({
  name,
  size = 20,
  color = 'currentColor',
  sw = 1.9,
  style = {}
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = '';
      const el = document.createElement('i');
      el.setAttribute('data-lucide', name);
      ref.current.appendChild(el);
      window.lucide.createIcons({
        attrs: {
          width: size,
          height: size,
          'stroke-width': sw
        }
      });
    }
  }, [name, size]);
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    style: {
      display: 'inline-flex',
      color,
      lineHeight: 0,
      ...style
    },
    "aria-hidden": true
  });
}
function MBtn({
  variant = 'primary',
  children,
  style = {},
  ...p
}) {
  const [h, setH] = useMS(false);
  const v = {
    primary: {
      background: h ? 'var(--color-primary-dark)' : 'var(--color-primary)',
      color: 'var(--color-primary-content)',
      border: '1px solid transparent',
      boxShadow: 'var(--shadow-soft)'
    },
    glass: {
      background: h ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.07)',
      color: '#fff',
      border: '1px solid rgba(255,255,255,.2)'
    },
    outline: {
      background: h ? 'var(--color-base-200)' : 'transparent',
      color: 'var(--color-fg)',
      border: '1px solid var(--color-surface-border)'
    }
  }[variant];
  return /*#__PURE__*/React.createElement("button", _extends({
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 46,
      padding: '0 22px',
      borderRadius: 'var(--radius-md)',
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: 15,
      cursor: 'pointer',
      transition: 'background .15s',
      ...v,
      ...style
    }
  }, p), children);
}

/* ---- NAV ---- */
function Nav() {
  const [dark, toggleDark] = useMktDark();
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 50,
      height: 64,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 40px',
      background: 'color-mix(in oklab, var(--color-base-100) 86%, transparent)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid var(--color-surface-border)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: dark ? '../../assets/hipertms-wordmark-dark.svg' : '../../assets/hipertms-wordmark.svg',
    alt: "HiperTMS",
    style: {
      height: 30
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 28,
      fontSize: 14,
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("a", {
    style: {
      color: 'var(--color-fg-muted)',
      textDecoration: 'none'
    },
    href: "#features"
  }, "Recursos"), /*#__PURE__*/React.createElement("a", {
    style: {
      color: 'var(--color-fg-muted)',
      textDecoration: 'none'
    },
    href: "#how"
  }, "Como funciona"), /*#__PURE__*/React.createElement("a", {
    style: {
      color: 'var(--color-fg-muted)',
      textDecoration: 'none'
    },
    href: "#pricing"
  }, "Planos"), /*#__PURE__*/React.createElement("button", {
    onClick: toggleDark,
    "aria-label": "Alternar tema",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 34,
      height: 34,
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-surface-border)',
      background: 'var(--color-surface-raised)',
      cursor: 'pointer',
      color: 'var(--color-fg-muted)'
    }
  }, /*#__PURE__*/React.createElement(MIcon, {
    name: dark ? 'sun' : 'moon',
    size: 17
  })), /*#__PURE__*/React.createElement("a", {
    style: {
      color: 'var(--color-fg)',
      textDecoration: 'none',
      fontWeight: 600
    }
  }, "Entrar"), /*#__PURE__*/React.createElement(MBtn, {
    variant: "primary",
    style: {
      height: 38,
      fontSize: 14
    }
  }, "Criar conta gr\xE1tis")));
}

/* ---- HERO ---- */
const HERO_CHIPS = [['calculator', 'Cotação em segundos', 'Preço com imposto, custo e margem, item a item.'], ['timer', 'Pronto em 5 minutos', 'Tabela nacional modelo já carregada. Sem implantação.'], ['shield-check', 'Fiscal em conformidade', 'CT-e, MDF-e e NF-e conforme SEFAZ e Receita Federal.'], ['sparkles', 'Financeiro automático', 'Vendas, abastecimento e manutenção alimentam o caixa sozinhos.']];
function Hero() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      overflow: 'hidden',
      padding: '56px 40px 80px',
      background: 'linear-gradient(180deg,#0e0f13,#16181d 55%,#23262e)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'radial-gradient(closest-side at 18% 18%, rgba(255,90,31,.18), transparent 60%), radial-gradient(closest-side at 78% 24%, rgba(255,138,92,.12), transparent 62%), radial-gradient(closest-side at 50% 92%, rgba(30,58,95,.20), transparent 60%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      maxWidth: 1200,
      margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 56,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 13px',
      borderRadius: 'var(--radius-full)',
      border: '1px solid rgba(255,255,255,.15)',
      background: 'rgba(255,255,255,.06)',
      color: 'rgba(255,255,255,.78)',
      fontSize: 13,
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement(MIcon, {
    name: "sparkles",
    size: 15,
    color: "var(--color-accent-warm-soft)"
  }), " O TMS feito para vender frete"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 50,
      lineHeight: 1.06,
      fontWeight: 800,
      letterSpacing: '-0.02em',
      color: '#fff',
      margin: '20px 0 0'
    }
  }, "Cadastrou, cotou. Comece a vender frete em 5 minutos."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 17,
      lineHeight: 1.75,
      color: 'rgba(255,255,255,.7)',
      marginTop: 20,
      maxWidth: '46ch'
    }
  }, "O HiperTMS j\xE1 vem com uma tabela nacional modelo: voc\xEA cria a conta, ajusta seus pre\xE7os e gera cota\xE7\xF5es em segundos. Sem taxa de implanta\xE7\xE3o e sem semanas de treinamento."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      marginTop: 30
    }
  }, /*#__PURE__*/React.createElement(MBtn, {
    variant: "primary"
  }, "Criar conta gr\xE1tis ", /*#__PURE__*/React.createElement(MIcon, {
    name: "arrow-right",
    size: 16,
    color: "var(--color-primary-content)"
  })), /*#__PURE__*/React.createElement(MBtn, {
    variant: "glass"
  }, "Cotar meu primeiro frete")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      marginTop: 32
    }
  }, HERO_CHIPS.map(([ic, t, d]) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      display: 'flex',
      gap: 12,
      padding: '13px 16px',
      borderRadius: 'var(--radius-2xl)',
      border: '1px solid rgba(255,255,255,.12)',
      background: 'rgba(255,255,255,.06)',
      backdropFilter: 'blur(6px)'
    }
  }, /*#__PURE__*/React.createElement(MIcon, {
    name: ic,
    size: 20,
    color: "var(--color-accent-warm-soft)",
    style: {
      marginTop: 2
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: '#fff'
    }
  }, t), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      lineHeight: 1.5,
      color: 'rgba(255,255,255,.7)',
      marginTop: 2
    }
  }, d)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      justifySelf: 'end',
      width: '100%',
      maxWidth: 420,
      transform: 'rotate(4deg)'
    }
  }, /*#__PURE__*/React.createElement(QuoteCard, null))));
}
function QuoteCard() {
  const rows = [['Frete (SP → Curitiba, 408 km)', 4000], ['Taxas e ad valorem', 100], ['Pedágio', 180], ['ICMS (12% por dentro)', 583.64]];
  const total = 4863.64,
    impostos = 877.79,
    custos = 2630.66,
    margem = total - impostos - custos;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 'var(--radius-3xl)',
      padding: 16,
      background: 'linear-gradient(135deg,#FF5A1F,#ED4708 45%,#1E3A5F)',
      boxShadow: '0 28px 64px -18px rgba(255,90,31,.3)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      borderRadius: 'calc(var(--radius-3xl) - 13px)',
      padding: '28px 26px',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 600,
      color: 'var(--color-base-content)'
    }
  }, "Exemplo de cota\xE7\xE3o"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'color-mix(in oklab,var(--color-base-content) 55%,transparent)',
      marginTop: 3
    }
  }, "Impostos, custos e margem com clareza.")), /*#__PURE__*/React.createElement("span", {
    style: {
      background: 'var(--color-success-tint)',
      color: 'var(--color-success-ink)',
      padding: '3px 10px',
      borderRadius: 'var(--radius-full)',
      fontSize: 12,
      fontWeight: 700
    }
  }, "+", BRLm(margem))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      fontSize: 14
    }
  }, rows.map(([l, v]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      color: 'color-mix(in oklab,var(--color-base-content) 68%,transparent)'
    }
  }, /*#__PURE__*/React.createElement("span", null, l), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontWeight: 500,
      color: 'var(--color-base-content)'
    }
  }, BRLm(v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      borderTop: '1px solid rgba(22,24,29,.09)',
      paddingTop: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      color: 'var(--color-base-content)'
    }
  }, "Total bruto"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontWeight: 700,
      color: 'var(--color-base-content)'
    }
  }, BRLm(total)))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid rgba(22,24,29,.09)',
      marginTop: 16,
      paddingTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '.14em',
      color: 'color-mix(in oklab,var(--color-base-content) 45%,transparent)',
      marginBottom: 10
    }
  }, "An\xE1lise cr\xEDtica"), [['Impostos total', impostos, 'var(--color-base-content)'], ['Custos operacionais', custos, 'var(--color-base-content)'], ['Margens', margem, 'var(--color-success)']].map(([l, v, c]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 12,
      marginBottom: 7,
      color: 'color-mix(in oklab,var(--color-base-content) 68%,transparent)'
    }
  }, /*#__PURE__*/React.createElement("span", null, l), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontWeight: 600,
      color: c
    }
  }, BRLm(v)))))));
}
function BRLm(n) {
  return 'R$ ' + n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/* ---- BENTO ---- */
const BENTO = [['calculator', 'Cotação em segundos', 'Monte o frete com imposto, custo e margem item a item. A precificação é o coração do HiperTMS: feita para fechar carga rápido.'], ['timer', 'Cadastrou, cotou (5 min)', 'Já vem com tabela nacional modelo. Crie a conta, ajuste seus preços e cote. Sem taxa de implantação, sem semanas de treinamento.'], ['file-check-2', 'Fiscal em conformidade', 'Emissão de CT-e, MDF-e e NF-e conforme SEFAZ e Receita Federal, no mesmo fluxo. Menos rejeição, menos retrabalho.'], ['wallet', 'Financeiro automático', 'Vendas, abastecimentos e manutenções lançados na plataforma alimentam o caixa sozinhos. Receitas e despesas sempre em dia.'], ['truck', 'Frota e motoristas sem susto', 'Alertas de troca de óleo, licenciamento, manutenção e exame toxicológico. Documentos sempre à mão, sem caçar papel.'], ['trending-up', 'Lucro por viagem', 'Receita vs custo/km na tela. Enxergue a margem antes de rodar e ajuste o preço a tempo.']];
function Bento() {
  return /*#__PURE__*/React.createElement("section", {
    id: "features",
    style: {
      padding: '72px 40px',
      background: 'linear-gradient(180deg, var(--color-surface-raised), color-mix(in oklab, var(--color-primary) 9%, var(--color-base-200)))',
      borderBottom: '1px solid var(--color-surface-border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1200,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      maxWidth: 640,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "O que voc\xEA ganha"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 36,
      fontWeight: 800,
      letterSpacing: '-0.02em',
      color: 'var(--color-base-content)',
      margin: '12px 0 0'
    }
  }, "Feito para vender frete \u2014 e pronto em 5 minutos."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      lineHeight: 1.6,
      color: 'var(--color-fg-muted)',
      marginTop: 14
    }
  }, "Comece a cotar em 5 minutos e mantenha venda, fiscal, financeiro e frota no mesmo lugar \u2014 sem trocar de sistema nem voltar pra planilha.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 16,
      marginTop: 40
    }
  }, BENTO.map(([ic, t, d]) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      background: 'var(--color-surface-raised)',
      borderRadius: 'var(--radius-xl)',
      padding: 24,
      boxShadow: 'var(--shadow-card)',
      border: '1px solid var(--color-surface-border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 'var(--radius-lg)',
      background: 'color-mix(in oklab,var(--color-primary) 12%,transparent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(MIcon, {
    name: ic,
    size: 20,
    color: "var(--color-primary)"
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--color-base-content)',
      margin: 0
    }
  }, t)), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      lineHeight: 1.6,
      color: 'var(--color-fg-muted)',
      marginTop: 12
    }
  }, d))))));
}

/* ---- HOW IT WORKS ---- */
const STEPS = [['1', 'Crie sua conta', 'Cadastro rápido — sem cartão, sem taxa de implantação. Sua operação já começa com uma tabela nacional modelo.'], ['2', 'Ajuste seus preços', 'Revise margens, custos e regras por rota ou cliente. O sistema sugere; você decide.'], ['3', 'Cote e venda frete', 'Gere cotações em segundos com imposto, custo e margem — envie ao cliente e feche carga.']];
function HowItWorks() {
  return /*#__PURE__*/React.createElement("section", {
    id: "how",
    style: {
      padding: '72px 40px',
      background: 'var(--color-base-100)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1100,
      margin: '0 auto',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Como funciona"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 34,
      fontWeight: 800,
      letterSpacing: '-0.02em',
      color: 'var(--color-base-content)',
      margin: '12px 0 40px'
    }
  }, "Do cadastro \xE0 primeira venda, em tr\xEAs passos."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 20
    }
  }, STEPS.map(([n, t, d]) => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 'var(--radius-full)',
      background: 'var(--color-base-content)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 18
    }
  }, n), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: 'var(--color-base-content)',
      margin: '16px 0 0'
    }
  }, t), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      lineHeight: 1.65,
      color: 'var(--color-fg-muted)',
      marginTop: 8
    }
  }, d))))));
}

/* ---- PRICING ---- */
const PLANS = [['Básico', 'Para começar: embarques, precificação e fiscal num lugar só.', 89, 890, false, ['1 usuário', '500 documentos/mês', '1 GB de armazenamento', 'Até 1 empresa no cadastro']], ['Essencial', 'O queridinho das pequenas transportadoras — atende 9 em cada 10 operações.', 299, 3588, true, ['5 usuários', '1.000 documentos/mês', '10 GB de armazenamento', '5 empresas/filiais']], ['Profissional', 'Para escalar: regras por cliente/rota e integrações ampliadas.', 599, 7188, false, ['15 usuários', '5.000 documentos/mês', '50 GB de armazenamento', 'Suporte prioritário']]];
function Pricing() {
  const [annual, setAnnual] = useMS(false);
  return /*#__PURE__*/React.createElement("section", {
    id: "pricing",
    style: {
      padding: '72px 40px',
      background: 'linear-gradient(180deg, color-mix(in oklab, var(--color-primary) 9%, var(--color-base-200)) 0%, var(--color-base-100) 60%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1100,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      maxWidth: 620,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Planos"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 36,
      fontWeight: 800,
      letterSpacing: '-0.02em',
      color: 'var(--color-base-content)',
      margin: '12px 0 0'
    }
  }, "Pre\xE7o de PME, sem taxa de implanta\xE7\xE3o"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      color: 'var(--color-fg-muted)',
      marginTop: 14
    }
  }, "Crie a conta e cote hoje. Sem projeto de implanta\xE7\xE3o, sem semanas de treinamento e sem surpresa na fatura."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      marginTop: 26,
      padding: '8px 16px',
      borderRadius: 'var(--radius-full)',
      border: '1px solid var(--color-surface-border)',
      background: 'var(--color-surface-raised)',
      boxShadow: 'var(--shadow-soft)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: annual ? 500 : 700,
      color: annual ? 'var(--color-fg-muted)' : 'var(--color-fg)'
    }
  }, "Mensal"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setAnnual(!annual),
    style: {
      width: 40,
      height: 22,
      borderRadius: 'var(--radius-full)',
      border: 'none',
      background: annual ? 'var(--color-primary)' : 'var(--color-base-300)',
      position: 'relative',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 2,
      left: annual ? 20 : 2,
      width: 18,
      height: 18,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: 'var(--shadow-soft)',
      transition: 'left .15s'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: annual ? 700 : 500,
      color: annual ? 'var(--color-fg)' : 'var(--color-fg-muted)'
    }
  }, "Anual"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 16,
      marginTop: 40,
      alignItems: 'start'
    }
  }, PLANS.map(([name, desc, m, y, pop, feats]) => {
    const price = annual ? y : m;
    const inner = /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--color-surface-raised)',
        borderRadius: pop ? 'calc(var(--radius-2xl) - 1px)' : 'var(--radius-2xl)',
        border: pop ? 'none' : '1px solid var(--color-surface-border)',
        padding: 26,
        boxShadow: 'var(--shadow-card)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("h3", {
      style: {
        fontSize: 17,
        fontWeight: 700,
        color: 'var(--color-base-content)',
        margin: 0
      }
    }, name), pop && /*#__PURE__*/React.createElement("span", {
      style: {
        background: 'linear-gradient(90deg,#16181D,#1E3A5F)',
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 10px',
        borderRadius: 'var(--radius-full)'
      }
    }, "Mais popular")), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 13,
        lineHeight: 1.5,
        color: 'var(--color-fg-muted)',
        marginTop: 8,
        minHeight: 40
      }
    }, desc), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        gap: 6,
        marginTop: 14
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontSize: 34,
        fontWeight: 800,
        color: 'var(--color-base-content)'
      }
    }, 'R$ ' + price.toLocaleString('pt-BR')), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        color: 'var(--color-fg-muted)',
        paddingBottom: 6
      }
    }, "/", annual ? 'ano' : 'mês')), /*#__PURE__*/React.createElement("ul", {
      style: {
        listStyle: 'none',
        padding: 0,
        margin: '18px 0 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }
    }, feats.map(f => /*#__PURE__*/React.createElement("li", {
      key: f,
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        fontSize: 14,
        color: 'var(--color-fg-muted)'
      }
    }, /*#__PURE__*/React.createElement(MIcon, {
      name: "check",
      size: 16,
      color: "var(--color-primary)",
      style: {
        marginTop: 1
      }
    }), f))), /*#__PURE__*/React.createElement(MBtn, {
      variant: pop ? 'primary' : 'outline',
      style: {
        width: '100%',
        marginTop: 22,
        borderRadius: 'var(--radius-xl)'
      }
    }, "Come\xE7ar agora"));
    return pop ? /*#__PURE__*/React.createElement("div", {
      key: name,
      style: {
        borderRadius: 'var(--radius-2xl)',
        padding: 1.5,
        background: 'linear-gradient(135deg,#FF5A1F,#ED4708 45%,#FF8A5C)',
        boxShadow: '0 24px 56px -16px rgba(255,90,31,.28)'
      }
    }, inner) : /*#__PURE__*/React.createElement("div", {
      key: name
    }, inner);
  }))));
}
function Eyebrow({
  children
}) {
  return /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '.2em',
      color: 'var(--color-primary)',
      margin: 0
    }
  }, children);
}

/* ---- FOOTER ---- */
function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: '#0e0f13',
      padding: '48px 40px',
      color: 'rgba(255,255,255,.65)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1200,
      margin: '0 auto',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      flexWrap: 'wrap',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 320
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/hipertms-wordmark-dark.svg",
    alt: "HiperTMS",
    style: {
      height: 28
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      lineHeight: 1.6,
      marginTop: 14,
      color: 'rgba(255,255,255,.65)'
    }
  }, "O TMS feito para vender frete. Precifique em segundos e saiba sua margem antes de rodar.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 56,
      fontSize: 13
    }
  }, [['Produto', ['Recursos', 'Planos', 'Cotação', 'Fiscal']], ['Empresa', ['Sobre', 'Contato', 'LGPD', 'Termos']]].map(([t, items]) => /*#__PURE__*/React.createElement("div", {
    key: t
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#ffffff',
      fontWeight: 600,
      marginBottom: 12
    }
  }, t), items.map(i => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      marginBottom: 8,
      cursor: 'pointer',
      color: 'rgba(255,255,255,.65)'
    }
  }, i)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1200,
      margin: '32px auto 0',
      paddingTop: 20,
      borderTop: '1px solid rgba(255,255,255,.12)',
      fontSize: 12,
      color: 'rgba(255,255,255,.5)'
    }
  }, "\xA9 2026 HiperTMS \xB7 Hipervias Sistemas Log\xEDsticos Ltda."));
}
Object.assign(window, {
  Nav,
  Hero,
  Bento,
  HowItWorks,
  Pricing,
  Footer
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/sections.jsx", error: String((e && e.message) || e) }); }

// work-tasks-list.js
try { (() => {
/* global window */
// Work · Tarefas — list page on the shared shell. `ico` is global.

const TASKS = [{
  titulo: 'Aprovar cotação COT-2026-0460',
  ctx: 'Atacadão Primavera · R$ 7.210,00',
  prio: ['error', 'Alta'],
  resp: 'MC',
  prazo: 'Hoje, 17:00',
  st: ['warning', 'Em aberto']
}, {
  titulo: 'Renovar CRLV — placa JKL0M12',
  ctx: 'Frota · VW Constellation',
  prio: ['error', 'Alta'],
  resp: 'RL',
  prazo: 'Amanhã',
  st: ['warning', 'Em aberto']
}, {
  titulo: 'Conferir CT-e rejeitado 000.1282',
  ctx: 'Fiscal · rejeição SEFAZ cód. 539',
  prio: ['warning', 'Média'],
  resp: 'FO',
  prazo: '11/06/2026',
  st: ['info', 'Em andamento']
}, {
  titulo: 'Cobrança — fatura vencida #4821',
  ctx: 'Financeiro · Cargas do Vale ME',
  prio: ['warning', 'Média'],
  resp: 'MC',
  prazo: '12/06/2026',
  st: ['info', 'Em andamento']
}, {
  titulo: 'Agendar exame toxicológico',
  ctx: 'Motorista · Carlos Mendes',
  prio: ['secondary', 'Baixa'],
  resp: 'RL',
  prazo: '18/06/2026',
  st: ['warning', 'Em aberto']
}, {
  titulo: 'Follow-up proposta Vale Verde',
  ctx: 'Comercial · contrato dedicado',
  prio: ['secondary', 'Baixa'],
  resp: 'JP',
  prazo: '20/06/2026',
  st: ['success', 'Concluída']
}];
const AVCOL = {
  FO: '#0284c7',
  MC: '#16a34a',
  RL: '#d97706',
  JP: '#7c3aed'
};
function row(t) {
  return `<tr>
    <td class="col-check"><input class="checkbox" type="checkbox" /></td>
    <td><div style="min-width:240px"><div class="name" style="font-size:14px;font-weight:500;white-space:normal">${t.titulo}</div><div class="cell-sub" style="margin-top:2px">${t.ctx}</div></div></td>
    <td><span class="badge ${t.prio[0]}">${t.prio[1]}</span></td>
    <td><span class="cell-avatar" style="width:28px;height:28px;border-radius:50%;background:${AVCOL[t.resp]};color:#fff;font-size:11px;font-weight:700">${t.resp}</span></td>
    <td class="cell-date">${t.prazo}</td>
    <td><span class="badge ${t.st[0]}">${t.st[1]}</span></td>
    <td class="col-actions"><button class="rowact">${ico('dots', 'ic5')}</button></td>
  </tr>`;
}
function sortable(label) {
  return `<button class="sortbtn">${label} <span style="opacity:.5">↕</span></button>`;
}
const content = `
<div class="page" data-screen-label="Tarefas">
  <div class="page-head">
    <div class="ph-icon">${ico('clipboard', 'ic6')}</div>
    <div style="flex:1;min-width:0">
      <p class="breadcrumb">Equipes <span>›</span> Tarefas</p>
      <h1 class="ph-title">Tarefas</h1>
      <p class="ph-desc">Pendências da operação atribuídas à equipe: prioridade, responsável e prazo. Geradas por eventos do sistema ou criadas manualmente.</p>
    </div>
    <button class="btn btn-primary">${ico('plus', 'ic4')} Nova tarefa</button>
  </div>

  <div class="list-toolbar">
    <div class="search">${ico('search', 'ic4')}<input type="text" placeholder="Buscar tarefa..." /></div>
    <button class="btn btn-soft">Minhas</button>
    <button class="btn btn-outline">${ico('funnel', 'ic4')} Filtros</button>
  </div>

  <p class="list-summary">Mostrando <strong>6</strong> tarefas · <strong>4</strong> em aberto · <strong>1</strong> vence hoje</p>

  <div class="table-card">
    <div class="tbl-scroll">
      <table class="dt">
        <thead><tr>
          <th class="col-check"><input class="checkbox" type="checkbox" /></th>
          <th>${sortable('Tarefa')}</th>
          <th>${sortable('Prioridade')}</th>
          <th>Resp.</th>
          <th>${sortable('Prazo')}</th>
          <th>${sortable('Status')}</th>
          <th class="col-actions"></th>
        </tr></thead>
        <tbody>${TASKS.map(row).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="pg-size">Itens por página <select><option>25</option><option>50</option></select></div>
      <div class="pg-nav"><button class="pg-btn" disabled>‹</button><button class="pg-btn active">1</button><button class="pg-btn">›</button></div>
    </div>
  </div>
</div>`;
window.AppShell.mountShell('app', {
  activeLabel: 'Equipes',
  content
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "work-tasks-list.js", error: String((e && e.message) || e) }); }

__ds_ns.MetricCard = __ds_scope.MetricCard;

__ds_ns.StatusBadge = __ds_scope.StatusBadge;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.DataTable = __ds_scope.DataTable;

__ds_ns.Pagination = __ds_scope.Pagination;

__ds_ns.Sidebar = __ds_scope.Sidebar;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

})();
