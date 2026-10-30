/* ==========================================================================
   Navalha & Co. – Sistema de agendamento (versão com API)

   Organização do arquivo:
   1. Configuração
   2. Estado da tela
   3. Funções utilitárias
   4. Comunicação com a API
   5. Renderização da tela
   6. Ações do usuário
   7. Cadastros do painel (serviços e barbeiros)
   8. Eventos e inicialização
   ========================================================================== */


/* ---------- 1. Configuração ---------- */

// Endereço da API: local quando o site roda no seu computador, publicada quando está no ar
const API_URL = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://127.0.0.1:8000'
  : 'https://barbearia-api-s29l.onrender.com'; // endereço da API publicada (Render)

const MAX_DAYS_AHEAD = 30; // até quantos dias à frente dá para agendar
const TOKEN_KEY = 'navalha-token';


/* ---------- 2. Estado da tela ---------- */

const state = {
  service: null,       // id do serviço escolhido
  barber: null,        // id do barbeiro escolhido
  date: '',            // 'AAAA-MM-DD'
  time: null,          // 'HH:MM'
  slots: null,         // null | 'loading' | 'closed' | 'error' | lista de 'HH:MM'
  slotsError: '',      // mensagem quando os horários não carregam
  confirmed: null,     // agendamento recém-confirmado
  catalogError: '',    // mensagem quando serviços/barbeiros não carregam
  waking: false        // true quando a API demora (plano gratuito dormindo)
};

let services = [];     // vêm da API
let barbers = [];      // vêm da API
let memoryToken = null; // plano B se o navegador bloquear o sessionStorage
let slotRequest = 0;    // identifica a busca de horários mais recente


/* ---------- 3. Funções utilitárias ---------- */

const $ = (selector) => document.querySelector(selector);

const pad = (n) => String(n).padStart(2, '0');

// Protege o HTML contra caracteres especiais vindos de campos digitados
function escapeHTML(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text).replace(/[&<>"']/g, (char) => map[char]);
}

function getService(id) {
  return services.find((service) => service.id === id);
}

// Date -> 'AAAA-MM-DD'
function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatBRL(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// '2026-11-03' -> 'terça-feira, 3 de novembro'
function formatDateLong(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

// Primeiro e último dia em que o cliente pode agendar ('AAAA-MM-DD')
function getBookingRange() {
  const first = new Date();
  const last = new Date();
  last.setDate(first.getDate() + MAX_DAYS_AHEAD);
  return { min: toISODate(first), max: toISODate(last) };
}

// O campo de data só bloqueia valores no calendário; quem digita à mão passa.
// Por isso a regra também é conferida aqui (e de novo na API).
function isDateAllowed(isoDate) {
  const { min, max } = getBookingRange();
  return isoDate >= min && isoDate <= max;
}

// Aplica a máscara (11) 91234-5678 enquanto a pessoa digita
function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;

  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;

  // Celular (9 dígitos) quebra em 5+4; telefone fixo em 4+4
  const cut = digits.length > 10 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}`;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('on');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('on'), 3200);
}

// Token de login do painel (fica só enquanto a aba estiver aberta)
function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || memoryToken;
  } catch (error) {
    return memoryToken;
  }
}

function setToken(value) {
  memoryToken = value;
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch (error) {}
}


/* ---------- 4. Comunicação com a API ---------- */

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// A API devolve { detail: "texto" } nos erros comuns e uma lista nos erros de validação
function extractMessage(data) {
  if (!data || !data.detail) return '';
  if (typeof data.detail === 'string') return data.detail;
  return 'Confira os dados informados e tente de novo.';
}

async function api(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = `Bearer ${getToken()}`;

  let response;
  try {
    response = await fetch(API_URL + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    throw new ApiError('Não foi possível conectar ao servidor. Tente novamente em instantes.', 0);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (error) {}

  if (!response.ok) {
    throw new ApiError(extractMessage(data) || 'Algo deu errado. Tente novamente.', response.status);
  }
  return data;
}

async function loadCatalog() {
  try {
    [services, barbers] = await Promise.all([api('/servicos'), api('/barbeiros')]);
    state.catalogError = '';
  } catch (error) {
    state.catalogError = error.message;
  }
}

// Busca na API os horários livres do barbeiro, no dia, para o serviço escolhido
async function loadSlots() {
  state.time = null;
  state.slots = null;
  state.slotsError = '';
  const request = ++slotRequest; // ignora respostas antigas se a pessoa mudar a escolha

  if (state.service && state.barber && state.date && isDateAllowed(state.date)) {
    if (new Date(`${state.date}T00:00:00`).getDay() === 0) {
      state.slots = 'closed'; // domingo
    } else {
      state.slots = 'loading';
      refresh();
      try {
        const query = new URLSearchParams({
          barbeiro_id: state.barber,
          servico_id: state.service,
          data: state.date
        });
        const result = await api(`/horarios?${query}`);
        if (request !== slotRequest) return;
        state.slots = result.horarios;
      } catch (error) {
        if (request !== slotRequest) return;
        state.slots = 'error';
        state.slotsError = error.message;
      }
    }
  }
  refresh();
}


/* ---------- 5. Renderização da tela ---------- */

function renderChoices() {
  const servicesBox = $('#services');
  const barbersBox = $('#pros');

  if (state.catalogError) {
    servicesBox.innerHTML = `<p class="note">${escapeHTML(state.catalogError)}</p>`;
    barbersBox.innerHTML = '';
    return;
  }
  if (!services.length) {
    servicesBox.innerHTML = state.waking
      ? '<p class="note">Acordando o servidor… Na primeira visita, isso pode levar até 1 minuto. Já já os serviços aparecem.</p>'
      : '<p class="note">Carregando serviços...</p>';
    barbersBox.innerHTML = '';
    return;
  }

  servicesBox.innerHTML = services.map((service) => `
    <button class="opt" data-svc="${service.id}" aria-pressed="${state.service === service.id}">
      <span class="pr">${formatBRL(service.preco)}</span>
      <b>${escapeHTML(service.nome)}</b>
      <small>${service.duracao_min} min</small>
    </button>
  `).join('');

  barbersBox.innerHTML = barbers.map((barber) => `
    <button class="opt" data-pro="${barber.id}" aria-pressed="${state.barber === barber.id}">
      <span class="ava">${escapeHTML(barber.nome.charAt(0))}</span>
      <b>${escapeHTML(barber.nome)}</b>
      <small>${escapeHTML(barber.especialidade || '')}</small>
    </button>
  `).join('');
}

function renderSlots() {
  const box = $('#slots');
  const note = $('#slotNote');
  box.innerHTML = '';
  note.textContent = '';

  if (state.slots === 'loading') {
    note.textContent = 'Buscando horários livres...';
  } else if (state.slots === 'closed') {
    note.textContent = 'Fechado aos domingos. Escolha outro dia.';
  } else if (state.slots === 'error') {
    note.textContent = state.slotsError;
  } else if (Array.isArray(state.slots)) {
    if (!state.slots.length) {
      note.textContent = 'Não há horários livres nesse dia. Escolha outra data.';
      return;
    }
    box.innerHTML = state.slots.map((time, index) => `
      <button class="slot" style="--i:${index}" data-t="${time}" aria-pressed="${state.time === time}">${time}</button>
    `).join('');
    note.textContent = 'Mostrando apenas os horários livres.';
  }
}

function renderSummary() {
  const box = $('#summary');

  // Depois de confirmar, mostra a mensagem de sucesso no lugar do resumo
  if (state.confirmed) {
    const item = state.confirmed;
    const firstName = item.cliente.split(' ')[0];
    box.innerHTML = `
      <div class="done">
        <div class="ok">✓</div>
        <h3>Horário confirmado</h3>
        <p class="note">${escapeHTML(firstName)}, esperamos você ${escapeHTML(formatDateLong(item.data))}
          às ${escapeHTML(item.hora_inicio)}, com ${escapeHTML(item.barbeiro)}.</p>
        <button class="btn" id="addCal" style="margin-top:14px;width:100%">Adicionar à agenda</button>
        <button class="btn ghost" id="again" style="margin-top:10px;width:100%">Fazer outro agendamento</button>
      </div>`;
    return;
  }

  const service = state.service ? getService(state.service) : null;
  const barber = state.barber ? barbers.find((item) => item.id === state.barber) : null;
  const pending = '<span style="color:var(--muted);font-weight:400">A escolher</span>';
  const row = (label, value) => `<dt>${label}</dt><dd>${value || pending}</dd>`;

  box.innerHTML = `
    <h3>Seu agendamento</h3>
    <dl>
      ${row('Serviço', service && escapeHTML(service.nome))}
      ${row('Barbeiro', barber && escapeHTML(barber.nome))}
      ${row('Dia', state.date && formatDateLong(state.date))}
      ${row('Horário', state.time)}
      ${row('Duração', service && `${service.duracao_min} min`)}
    </dl>
    <div class="total">
      <span>Total no balcão</span>
      <b>${service ? formatBRL(service.preco) : 'R$ 0,00'}</b>
    </div>
    <p class="err" id="err"></p>
    <button class="btn" id="confirm">Confirmar horário</button>`;
}

// Libera as etapas conforme a pessoa avança
function updateLocks() {
  $('#s2').classList.toggle('locked', !state.service);
  $('#s3').classList.toggle('locked', !(state.service && state.barber));
  $('#s4').classList.toggle('locked', state.time === null);
}

function refresh() {
  renderChoices();
  renderSlots();
  renderSummary();
  updateLocks();
}

// Painel do barbeiro: mostra o login ou a agenda, conforme a pessoa esteja logada
async function renderPanel() {
  const loginBox = $('#login');
  const adminArea = $('#adminArea');

  if (!getToken()) {
    loginBox.hidden = false;
    adminArea.hidden = true;
    return;
  }
  loginBox.hidden = true;
  adminArea.hidden = false;
  $('#stats').innerHTML = '';
  $('#list').innerHTML = '<div class="empty">Carregando agendamentos...</div>';

  try {
    paintPanel(await api('/agendamentos', { auth: true }));
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      setToken(null);
      showToast('Sessão expirada. Entre novamente.');
      renderPanel();
      return;
    }
    $('#list').innerHTML = `<div class="empty">${escapeHTML(error.message)}</div>`;
  }
}

function paintPanel(items) {
  const today = toISODate(new Date());
  const todayCount = items.filter((item) => item.data === today).length;
  const revenue = items.reduce((sum, item) => sum + item.preco, 0);

  $('#stats').innerHTML = `
    <div class="card stat"><b>${todayCount}</b><span>agendamentos hoje</span></div>
    <div class="card stat"><b>${items.length}</b><span>próximos horários</span></div>
    <div class="card stat"><b>${formatBRL(revenue)}</b><span>previsto nos próximos horários</span></div>`;

  if (!items.length) {
    $('#list').innerHTML = '<div class="empty">Nenhum horário marcado. Quando alguém agendar, aparece aqui.</div>';
    return;
  }

  $('#list').innerHTML = items.map((item) => {
    const shortDate = new Date(`${item.data}T00:00:00`).toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit'
    });
    return `
      <div class="appt">
        <div class="when">${escapeHTML(item.hora_inicio)}<small>${escapeHTML(shortDate)}</small></div>
        <div class="who">
          <b>${escapeHTML(item.cliente)}</b>
          <small>${escapeHTML(item.servico)} · ${escapeHTML(item.barbeiro)} · ${escapeHTML(formatPhone(item.telefone))}</small>
        </div>
        <a class="cancel remind" href="${whatsappLink(item)}" target="_blank" rel="noopener">Lembrar</a>
        <button class="cancel" data-cancel="${item.id}">Cancelar</button>
      </div>`;
  }).join('');
}


/* ---------- 6. Ações do usuário ---------- */

async function confirmBooking() {
  const errorBox = $('#err');
  const button = $('#confirm');
  const name = $('#nome').value.trim();
  const phone = $('#tel').value;

  // Validações rápidas no navegador (a API repete todas elas)
  if (!state.service || !state.barber || !state.date || state.time === null) {
    errorBox.textContent = 'Escolha serviço, barbeiro, dia e horário para continuar.';
    return;
  }
  if (!isDateAllowed(state.date)) {
    errorBox.textContent = 'Escolha uma data entre hoje e os próximos 30 dias.';
    return;
  }
  if (name.length < 2) {
    errorBox.textContent = 'Informe seu nome.';
    $('#nome').focus();
    return;
  }
  if (phone.replace(/\D/g, '').length < 10) {
    errorBox.textContent = 'Informe um celular com DDD.';
    $('#tel').focus();
    return;
  }

  errorBox.textContent = '';
  button.disabled = true;
  button.textContent = 'Confirmando...';

  try {
    state.confirmed = await api('/agendamentos', {
      method: 'POST',
      body: {
        servico_id: state.service,
        barbeiro_id: state.barber,
        data: state.date,
        hora_inicio: state.time,
        nome: name,
        telefone: phone
      }
    });
    refresh();
    showToast('Horário confirmado');
  } catch (error) {
    if (error.status === 409) {
      // Alguém ocupou o horário nesse meio-tempo: atualiza a lista e avisa
      await loadSlots();
      $('#err').textContent = error.message;
      return;
    }
    errorBox.textContent = error.message;
    button.disabled = false;
    button.textContent = 'Confirmar horário';
  }
}

// Lembrete para o cliente: arquivo de calendário (.ics) com alarmes de 1 dia e 1 hora antes
function addToCalendar() {
  const item = state.confirmed;
  if (!item) return;

  const icsText = (text) => String(text).replace(/([,;\\])/g, '\\$1');
  const stamp = (time) => `${item.data.replaceAll('-', '')}T${time.replace(':', '')}00`;
  const alarm = (trigger, message) => [
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${message}`, `TRIGGER:${trigger}`, 'END:VALARM'
  ];

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Navalha & Co.//Agendamento//PT-BR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${item.id}-${Date.now()}@navalha-co.exemplo`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART:${stamp(item.hora_inicio)}`,
    `DTEND:${stamp(item.hora_fim)}`,
    `SUMMARY:${icsText(item.servico)} na Navalha & Co.`,
    `DESCRIPTION:${icsText(`Barbeiro: ${item.barbeiro}`)}`,
    `LOCATION:${icsText('Rua das Tesouras, 123 - Centro (endereço fictício)')}`,
    ...alarm('-P1D', 'Amanhã é o seu horário na Navalha & Co.'),
    ...alarm('-PT1H', 'Seu horário na Navalha & Co. é daqui a 1 hora'),
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  const file = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'horario-navalha.ics';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Arquivo de calendário baixado');
}

// Lembrete pelo painel: abre o WhatsApp com a mensagem pronta para o cliente
function whatsappLink(item) {
  const digits = item.telefone.replace(/\D/g, '');
  const firstName = item.cliente.split(' ')[0];
  const text = `Olá, ${firstName}! Passando para lembrar do seu horário na Navalha & Co.: `
    + `${item.servico} com ${item.barbeiro}, ${formatDateLong(item.data)} às ${item.hora_inicio}. Até lá!`;
  return `https://wa.me/55${digits}?text=${encodeURIComponent(text)}`;
}

function resetBooking() {
  state.service = null;
  state.barber = null;
  state.time = null;
  state.slots = null;
  state.confirmed = null;
  state.date = '';
  $('#date').value = '';
  $('#nome').value = '';
  $('#tel').value = '';
  refresh();
  window.scrollTo(0, 0);
}

async function doLogin() {
  const email = $('#email').value.trim();
  const password = $('#senha').value;
  const errorBox = $('#loginErr');
  const button = $('#loginBtn');

  if (!email || !password) {
    errorBox.textContent = 'Informe e-mail e senha.';
    return;
  }

  errorBox.textContent = '';
  button.disabled = true;
  button.textContent = 'Entrando...';
  try {
    const result = await api('/login', { method: 'POST', body: { email, senha: password } });
    setToken(result.access_token);
    $('#senha').value = '';
    renderPanel();
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Entrar';
  }
}

function logout() {
  setToken(null);
  showSub('agenda');
}

// O cancelamento pede um segundo clique para evitar toques acidentais
async function cancelAppointment(button) {
  if (!button.classList.contains('armed')) {
    button.classList.add('armed');
    button.textContent = 'Confirmar cancelamento';
    return;
  }

  button.disabled = true;
  try {
    await api(`/agendamentos/${button.dataset.cancel}/cancelar`, { method: 'PATCH', auth: true });
    showToast('Horário cancelado e liberado');
    renderPanel();
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
    if (error.status === 401 || error.status === 403) logout();
  }
}

// Alterna entre as abas "Agendar" e "Painel"
function showTab(name) {
  document.querySelectorAll('nav button').forEach((button) => {
    button.setAttribute('aria-current', String(button.dataset.tab === name));
  });
  $('#agendar').hidden = name !== 'agendar';
  $('#painel').hidden = name !== 'painel';
  if (name === 'painel') renderPanel();
  window.scrollTo(0, 0);
}


/* ---------- 7. Cadastros do painel (serviços e barbeiros) ---------- */

const admin = {
  services: [],
  barbers: [],
  editing: { servico: null, barbeiro: null } // id em edição; null quando é um cadastro novo
};

// Campos e textos de cada formulário
const FORMS = {
  servico: {
    title: '#svcFormTitle', save: '#svcSave', cancel: '#svcCancel', error: '#svcErr',
    fields: ['#svcNome', '#svcMin', '#svcPreco'],
    newTitle: 'Novo serviço', editTitle: 'Editar serviço', newButton: 'Cadastrar serviço',
    path: '/admin/servicos'
  },
  barbeiro: {
    title: '#brbFormTitle', save: '#brbSave', cancel: '#brbCancel', error: '#brbErr',
    fields: ['#brbNome', '#brbEsp'],
    newTitle: 'Novo barbeiro', editTitle: 'Editar barbeiro', newButton: 'Cadastrar barbeiro',
    path: '/admin/barbeiros'
  }
};

// Sessão expirada: volta para a tela de login
function handleAuthError(error) {
  if (error.status !== 401 && error.status !== 403) return false;
  setToken(null);
  showToast('Sessão expirada. Entre novamente.');
  renderPanel();
  return true;
}

async function loadAdminLists() {
  try {
    [admin.services, admin.barbers] = await Promise.all([
      api('/admin/servicos', { auth: true }),
      api('/admin/barbeiros', { auth: true })
    ]);
    renderAdminLists();
  } catch (error) {
    if (handleAuthError(error)) return;
    const message = `<div class="empty">${escapeHTML(error.message)}</div>`;
    $('#svcList').innerHTML = message;
    $('#brbList').innerHTML = message;
  }
}

function adminRow(kind, item, detail) {
  return `
    <div class="appt ${item.ativo ? '' : 'off'}">
      <div class="who">
        <b>${escapeHTML(item.nome)}</b>${item.ativo ? '' : '<span class="tag">Inativo</span>'}
        <small>${detail}</small>
      </div>
      <button class="cancel remind" data-edit="${kind}:${item.id}">Editar</button>
      <button class="cancel" data-toggle="${kind}:${item.id}">${item.ativo ? 'Desativar' : 'Ativar'}</button>
    </div>`;
}

function renderAdminLists() {
  $('#svcList').innerHTML = admin.services.length
    ? admin.services.map((item) => adminRow('servico', item, `${item.duracao_min} min · ${formatBRL(item.preco)}`)).join('')
    : '<div class="empty">Nenhum serviço cadastrado.</div>';

  $('#brbList').innerHTML = admin.barbers.length
    ? admin.barbers.map((item) => adminRow('barbeiro', item, escapeHTML(item.especialidade || 'Sem especialidade'))).join('')
    : '<div class="empty">Nenhum barbeiro cadastrado.</div>';
}

function resetForm(kind) {
  const form = FORMS[kind];
  admin.editing[kind] = null;
  form.fields.forEach((selector) => { $(selector).value = ''; });
  $(form.error).textContent = '';
  $(form.title).textContent = form.newTitle;
  $(form.save).textContent = form.newButton;
  $(form.cancel).hidden = true;
}

// Preenche o formulário com o item escolhido e troca o botão para "Salvar alterações"
function startEdit(kind, id) {
  const form = FORMS[kind];
  const list = kind === 'servico' ? admin.services : admin.barbers;
  const item = list.find((entry) => entry.id === id);
  if (!item) return;

  admin.editing[kind] = id;
  $(form.fields[0]).value = item.nome;
  if (kind === 'servico') {
    $('#svcMin').value = item.duracao_min;
    $('#svcPreco').value = item.preco.toFixed(2).replace('.', ',');
  } else {
    $('#brbEsp').value = item.especialidade || '';
  }
  $(form.error).textContent = '';
  $(form.title).textContent = form.editTitle;
  $(form.save).textContent = 'Salvar alterações';
  $(form.cancel).hidden = false;
  $(form.title).scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Depois de qualquer mudança: atualiza as listas do painel e o formulário público de agendamento
async function afterCatalogChange() {
  await loadAdminLists();
  await loadCatalog();

  // Se o que estava escolhido no agendamento deixou de existir, limpa a escolha
  if (state.service && !getService(state.service)) {
    state.service = null;
    state.time = null;
    state.slots = null;
  }
  if (state.barber && !barbers.some((item) => item.id === state.barber)) {
    state.barber = null;
    state.time = null;
    state.slots = null;
  }
  refresh();
}

async function submitForm(kind, body) {
  const form = FORMS[kind];
  const id = admin.editing[kind];
  const button = $(form.save);
  const label = kind === 'servico' ? 'Serviço' : 'Barbeiro';

  button.disabled = true;
  try {
    await api(id ? `${form.path}/${id}` : form.path, {
      method: id ? 'PATCH' : 'POST',
      body,
      auth: true
    });
    showToast(id ? `${label} atualizado` : `${label} cadastrado`);
    resetForm(kind);
    await afterCatalogChange();
  } catch (error) {
    if (!handleAuthError(error)) $(form.error).textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function saveService() {
  const errorBox = $('#svcErr');
  const name = $('#svcNome').value.trim();
  const minutes = Number($('#svcMin').value);
  const price = Number($('#svcPreco').value.replace(',', '.'));

  if (name.length < 2) {
    errorBox.textContent = 'Informe o nome do serviço.';
  } else if (!Number.isInteger(minutes) || minutes < 15 || minutes > 240 || minutes % 5 !== 0) {
    errorBox.textContent = 'A duração deve ficar entre 15 e 240 minutos, em múltiplos de 5.';
  } else if (!(price > 0) || price > 10000) {
    errorBox.textContent = 'Informe um preço maior que zero.';
  } else {
    errorBox.textContent = '';
    submitForm('servico', { nome: name, duracao_min: minutes, preco: price });
  }
}

function saveBarber() {
  const errorBox = $('#brbErr');
  const name = $('#brbNome').value.trim();

  if (name.length < 2) {
    errorBox.textContent = 'Informe o nome do barbeiro.';
    return;
  }
  errorBox.textContent = '';
  submitForm('barbeiro', { nome: name, especialidade: $('#brbEsp').value.trim() });
}

// Ativa ou desativa (nada é apagado, para não perder o histórico de agendamentos)
async function toggleActive(kind, id) {
  const form = FORMS[kind];
  const list = kind === 'servico' ? admin.services : admin.barbers;
  const item = list.find((entry) => entry.id === id);
  if (!item) return;

  try {
    await api(`${form.path}/${id}`, { method: 'PATCH', body: { ativo: !item.ativo }, auth: true });
    showToast(item.ativo ? 'Desativado: some do site' : 'Ativado: voltou ao site');
    if (admin.editing[kind] === id) resetForm(kind);
    await afterCatalogChange();
  } catch (error) {
    if (!handleAuthError(error)) showToast(error.message);
  }
}

// Alterna entre "Agenda", "Serviços" e "Barbeiros" dentro do painel
function showSub(name) {
  document.querySelectorAll('.subnav button').forEach((button) => {
    button.setAttribute('aria-current', String(button.dataset.sub === name));
  });
  $('#paneAgenda').hidden = name !== 'agenda';
  $('#paneServicos').hidden = name !== 'servicos';
  $('#paneBarbeiros').hidden = name !== 'barbeiros';

  if (name === 'agenda') renderPanel();
  else loadAdminLists();
}


/* ---------- 8. Eventos e inicialização ---------- */

// Um único "ouvinte" de clique trata todos os botões da página
document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.dataset.tab) {
    showTab(button.dataset.tab);
  } else if (button.dataset.svc) {
    state.service = Number(button.dataset.svc);
    state.confirmed = null;
    loadSlots();
  } else if (button.dataset.pro) {
    state.barber = Number(button.dataset.pro);
    state.confirmed = null;
    loadSlots();
  } else if (button.dataset.t) {
    state.time = button.dataset.t;
    renderSlots();
    renderSummary();
    updateLocks();
  } else if (button.id === 'confirm') {
    confirmBooking();
  } else if (button.id === 'addCal') {
    addToCalendar();
  } else if (button.id === 'again') {
    resetBooking();
  } else if (button.id === 'loginBtn') {
    doLogin();
  } else if (button.id === 'logout') {
    logout();
  } else if (button.dataset.sub) {
    showSub(button.dataset.sub);
  } else if (button.id === 'svcSave') {
    saveService();
  } else if (button.id === 'svcCancel') {
    resetForm('servico');
  } else if (button.id === 'brbSave') {
    saveBarber();
  } else if (button.id === 'brbCancel') {
    resetForm('barbeiro');
  } else if (button.dataset.edit) {
    const [kind, id] = button.dataset.edit.split(':');
    startEdit(kind, Number(id));
  } else if (button.dataset.toggle) {
    const [kind, id] = button.dataset.toggle.split(':');
    toggleActive(kind, Number(id));
  } else if (button.dataset.cancel) {
    cancelAppointment(button);
  }
});

// Brilho suave que acompanha o mouse em botões e opções
document.addEventListener('pointermove', (event) => {
  const target = event.target.closest('.btn, .opt');
  if (!target) return;
  const box = target.getBoundingClientRect();
  target.style.setProperty('--mx', `${event.clientX - box.left}px`);
  target.style.setProperty('--my', `${event.clientY - box.top}px`);
});

// Campo de data: de hoje até 30 dias à frente
const dateInput = $('#date');
const range = getBookingRange();
dateInput.min = range.min;
dateInput.max = range.max;

dateInput.addEventListener('change', () => {
  state.confirmed = null;

  // Data digitada fora do prazo (passada ou distante demais): recusa e limpa o campo
  if (dateInput.value && !isDateAllowed(dateInput.value)) {
    showToast('Escolha uma data a partir de hoje, em até 30 dias.');
    dateInput.value = '';
    state.date = '';
  } else {
    state.date = dateInput.value;
  }
  loadSlots();
});

$('#tel').addEventListener('input', (event) => {
  event.target.value = formatPhone(event.target.value);
});

$('#senha').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') doLogin();
});

// Efeito de entrada: os blocos aparecem suavemente quando entram na tela
function setupReveal() {
  document.documentElement.classList.add('js');
  const items = document.querySelectorAll('.reveal');

  if (!('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('in'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  items.forEach((item) => observer.observe(item));
}

// Início: mostra a tela e carrega serviços e barbeiros da API
async function init() {
  setupReveal();
  refresh();

  // Se a API demorar (plano gratuito "dormindo"), avisa em vez de parecer travado
  const wakeTimer = setTimeout(() => {
    state.waking = true;
    refresh();
  }, 4000);

  await loadCatalog();
  clearTimeout(wakeTimer);
  state.waking = false;
  refresh();
  if (location.hash === '#painel') showTab('painel');
}

init();