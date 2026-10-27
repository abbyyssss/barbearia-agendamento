/* ==========================================================================
   Navalha & Co. – Sistema de agendamento

   Organização do arquivo:
   1. Dados fixos (serviços e barbeiros)
   2. Estado da tela
   3. Funções utilitárias
   4. Armazenamento (localStorage)
   5. Regras de horários
   6. Renderização da tela
   7. Ações do usuário
   8. Eventos e inicialização
   ========================================================================== */


/* ---------- 1. Dados fixos ---------- */

const SERVICES = [
  { id: 'corte', nome: 'Corte clássico',          min: 45, preco: 55, desc: 'Tesoura e máquina, com finalização em pomada.' },
  { id: 'barba', nome: 'Barba com toalha quente', min: 30, preco: 40, desc: 'Navalha, toalha quente e hidratação.' },
  { id: 'combo', nome: 'Corte e barba',           min: 75, preco: 85, desc: 'O serviço completo, com desconto.' },
  { id: 'acab',  nome: 'Acabamento e sobrancelha', min: 30, preco: 25, desc: 'Contorno e detalhes para manter o corte.' }
];

const BARBERS = [
  { id: 'Rafael', tag: 'Cortes clássicos' },
  { id: 'Diego',  tag: 'Barba e navalha' },
  { id: 'Marcos', tag: 'Degradê e estilo' }
];

// Funcionamento (em minutos desde 00:00)
const OPEN_TIME = 9 * 60;
const CLOSE_WEEKDAY = 19 * 60;
const CLOSE_SATURDAY = 16 * 60;
const SLOT_STEP = 30;
const MAX_DAYS_AHEAD = 30; // até quantos dias à frente dá para agendar

const STORAGE_KEY = 'navalha-agenda-v1';
const SEED_KEY = 'navalha-agenda-seed';


/* ---------- 2. Estado da tela ---------- */

// Guarda o que o cliente já escolheu no formulário
const state = {
  service: null,   // id do serviço
  barber: null,    // id do barbeiro
  date: '',        // 'AAAA-MM-DD'
  time: null,      // minutos desde 00:00
  confirmed: null  // agendamento recém-confirmado
};

// Plano B caso o navegador bloqueie o localStorage
let memoryStore = [];


/* ---------- 3. Funções utilitárias ---------- */

const $ = (selector) => document.querySelector(selector);

const pad = (n) => String(n).padStart(2, '0');

// Protege o HTML contra caracteres especiais digitados pelo usuário
function escapeHTML(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text).replace(/[&<>"']/g, (char) => map[char]);
}

function randomId() {
  return Math.random().toString(36).slice(2);
}

function getService(id) {
  return SERVICES.find((service) => service.id === id);
}

// Date -> 'AAAA-MM-DD'
function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Primeiro e último dia em que o cliente pode agendar ('AAAA-MM-DD')
function getBookingRange() {
  const first = new Date();
  const last = new Date();
  last.setDate(first.getDate() + MAX_DAYS_AHEAD);
  return { min: toISODate(first), max: toISODate(last) };
}

// O campo de data só bloqueia valores no calendário; quem digita à mão passa.
// Por isso a regra também é conferida aqui, no JavaScript.
function isDateAllowed(isoDate) {
  const { min, max } = getBookingRange();
  return isoDate >= min && isoDate <= max;
}

// 570 -> '09:30'
function formatTime(minutes) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
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
  showToast.timer = setTimeout(() => toast.classList.remove('on'), 2600);
}


/* ---------- 4. Armazenamento (localStorage) ---------- */

function loadAppointments() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : memoryStore;
  } catch (error) {
    return memoryStore;
  }
}

function saveAppointments(list) {
  memoryStore = list;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (error) {
    // Sem localStorage: os dados ficam só em memória até recarregar a página
  }
}

// Cria 3 agendamentos de exemplo na primeira visita, para o painel não ficar vazio
function seedExamples() {
  let alreadySeeded = false;
  try {
    alreadySeeded = localStorage.getItem(SEED_KEY);
  } catch (error) {}

  if (alreadySeeded || loadAppointments().length) return;

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const make = (date, start, serviceId, barber, cliente, tel) => ({
    id: randomId(),
    svc: serviceId,
    pro: barber,
    date: toISODate(date),
    start,
    min: getService(serviceId).min,
    preco: getService(serviceId).preco,
    cliente,
    tel
  });

  saveAppointments([
    make(today,    15 * 60,      'corte', 'Rafael', 'Bruno Alves',    '(11) 98877-1020'),
    make(tomorrow, 10 * 60,      'combo', 'Diego',  'Lucas Pereira',  '(11) 97766-3041'),
    make(tomorrow, 14 * 60 + 30, 'barba', 'Marcos', 'André Souza',    '(11) 95544-2288')
  ]);

  try {
    localStorage.setItem(SEED_KEY, '1');
  } catch (error) {}
}


/* ---------- 5. Regras de horários ---------- */

/*
  Devolve a lista de horários do dia escolhido, cada um com { t, off }:
  - t:   início em minutos desde 00:00
  - off: true quando o horário não pode ser escolhido
  Devolve null se faltar escolha, ou 'closed' se a barbearia estiver fechada.
*/
function getSlots() {
  if (!state.service || !state.barber || !state.date) return null;
  if (!isDateAllowed(state.date)) return null;

  const day = new Date(`${state.date}T00:00:00`);
  const weekday = day.getDay();
  if (weekday === 0) return 'closed'; // domingo

  const service = getService(state.service);
  const now = new Date();
  const isToday = state.date === toISODate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const closeTime = weekday === 6 ? CLOSE_SATURDAY : CLOSE_WEEKDAY;

  // Agendamentos que já existem para o mesmo barbeiro no mesmo dia
  const taken = loadAppointments().filter(
    (item) => item.date === state.date && item.pro === state.barber
  );

  const slots = [];
  for (let start = OPEN_TIME; start + service.min <= closeTime; start += SLOT_STEP) {
    // Dois intervalos se sobrepõem quando cada um começa antes do outro terminar
    const overlaps = taken.some(
      (item) => start < item.start + item.min && item.start < start + service.min
    );
    const inThePast = isToday && start <= nowMinutes;
    slots.push({ t: start, off: overlaps || inThePast });
  }
  return slots;
}


/* ---------- 6. Renderização da tela ---------- */

function renderChoices() {
  $('#services').innerHTML = SERVICES.map((service) => `
    <button class="opt" data-svc="${service.id}" aria-pressed="${state.service === service.id}">
      <span class="pr">${formatBRL(service.preco)}</span>
      <b>${service.nome}</b>
      <small>${service.min} min · ${service.desc}</small>
    </button>
  `).join('');

  $('#pros').innerHTML = BARBERS.map((barber) => `
    <button class="opt" data-pro="${barber.id}" aria-pressed="${state.barber === barber.id}">
      <b>${barber.id}</b>
      <small>${barber.tag}</small>
    </button>
  `).join('');
}

function renderSlots() {
  const slots = getSlots();
  const box = $('#slots');
  const note = $('#slotNote');

  if (slots === null) {
    box.innerHTML = '';
    note.textContent = '';
    return;
  }
  if (slots === 'closed') {
    box.innerHTML = '';
    note.textContent = 'Fechado aos domingos. Escolha outro dia.';
    return;
  }

  box.innerHTML = slots.map((slot) => `
    <button class="slot" data-t="${slot.t}" ${slot.off ? 'disabled' : ''} aria-pressed="${state.time === slot.t}">
      ${formatTime(slot.t)}
    </button>
  `).join('');

  note.textContent = slots.some((slot) => !slot.off)
    ? 'Horários riscados já estão ocupados.'
    : 'Não há horários livres nesse dia. Escolha outra data.';
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
        <p class="note">${escapeHTML(firstName)}, esperamos você ${escapeHTML(formatDateLong(item.date))}
          às ${formatTime(item.start)}, com ${escapeHTML(item.pro)}.</p>
        <button class="btn" id="again" style="margin-top:14px;width:100%">Fazer outro agendamento</button>
      </div>`;
    return;
  }

  const service = state.service ? getService(state.service) : null;
  const pending = '<span style="color:var(--muted);font-weight:400">A escolher</span>';
  const row = (label, value) => `<dt>${label}</dt><dd>${value || pending}</dd>`;

  box.innerHTML = `
    <h3>Seu agendamento</h3>
    <dl>
      ${row('Serviço', service && service.nome)}
      ${row('Barbeiro', state.barber)}
      ${row('Dia', state.date && formatDateLong(state.date))}
      ${row('Horário', state.time !== null && formatTime(state.time))}
      ${row('Duração', service && `${service.min} min`)}
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

function renderAll() {
  renderChoices();
  renderSlots();
  renderSummary();
  updateLocks();
}

function renderPanel() {
  const today = toISODate(new Date());

  // Só os horários de hoje em diante, em ordem cronológica
  const upcoming = loadAppointments()
    .filter((item) => item.date >= today)
    .sort((a, b) => (a.date + formatTime(a.start)).localeCompare(b.date + formatTime(b.start)));

  const todayCount = upcoming.filter((item) => item.date === today).length;
  const revenue = upcoming.reduce((sum, item) => sum + item.preco, 0);

  $('#stats').innerHTML = `
    <div class="card stat"><b>${todayCount}</b><span>agendamentos hoje</span></div>
    <div class="card stat"><b>${upcoming.length}</b><span>próximos horários</span></div>
    <div class="card stat"><b>${formatBRL(revenue)}</b><span>previsto nos próximos horários</span></div>`;

  if (!upcoming.length) {
    $('#list').innerHTML = '<div class="empty">Nenhum horário marcado. Quando alguém agendar, aparece aqui.</div>';
    return;
  }

  $('#list').innerHTML = upcoming.map((item) => {
    const service = getService(item.svc);
    const shortDate = new Date(`${item.date}T00:00:00`).toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit'
    });
    return `
      <div class="appt">
        <div class="when">${formatTime(item.start)}<small>${escapeHTML(shortDate)}</small></div>
        <div class="who">
          <b>${escapeHTML(item.cliente)}</b>
          <small>${escapeHTML(service ? service.nome : 'Serviço')} · ${escapeHTML(item.pro)} · ${escapeHTML(item.tel)}</small>
        </div>
        <button class="cancel" data-cancel="${item.id}">Cancelar</button>
      </div>`;
  }).join('');
}


/* ---------- 7. Ações do usuário ---------- */

function confirmBooking() {
  const errorBox = $('#err');
  const name = $('#nome').value.trim();
  const phone = $('#tel').value;

  // Validações, uma por vez, com mensagem clara
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

  // Confere de novo se o horário continua livre antes de salvar
  const slots = getSlots();
  const stillFree = Array.isArray(slots) && slots.some((slot) => slot.t === state.time && !slot.off);
  if (!stillFree) {
    errorBox.textContent = 'Esse horário acabou de ser ocupado. Escolha outro.';
    state.time = null;
    renderAll();
    return;
  }

  const service = getService(state.service);
  const appointment = {
    id: randomId(),
    svc: state.service,
    pro: state.barber,
    date: state.date,
    start: state.time,
    min: service.min,
    preco: service.preco,
    cliente: name,
    tel: phone
  };

  saveAppointments(loadAppointments().concat(appointment));
  state.confirmed = appointment;
  renderAll();
  renderPanel();
  showToast('Horário confirmado');
}

function resetBooking() {
  state.service = null;
  state.barber = null;
  state.time = null;
  state.confirmed = null;
  state.date = '';
  $('#date').value = '';
  $('#nome').value = '';
  $('#tel').value = '';
  renderAll();
  window.scrollTo(0, 0);
}

// O cancelamento pede um segundo clique para evitar toques acidentais
function cancelAppointment(button) {
  if (!button.classList.contains('armed')) {
    button.classList.add('armed');
    button.textContent = 'Confirmar cancelamento';
    return;
  }
  saveAppointments(loadAppointments().filter((item) => item.id !== button.dataset.cancel));
  renderPanel();
  renderSlots();
  showToast('Horário cancelado e liberado');
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


/* ---------- 8. Eventos e inicialização ---------- */

// Um único "ouvinte" de clique trata todos os botões da página
document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.dataset.tab) {
    showTab(button.dataset.tab);
  } else if (button.dataset.svc) {
    state.service = button.dataset.svc;
    state.time = null;
    state.confirmed = null;
    renderAll();
  } else if (button.dataset.pro) {
    state.barber = button.dataset.pro;
    state.time = null;
    state.confirmed = null;
    renderAll();
  } else if (button.dataset.t) {
    state.time = Number(button.dataset.t);
    renderSlots();
    renderSummary();
    updateLocks();
  } else if (button.id === 'confirm') {
    confirmBooking();
  } else if (button.id === 'again') {
    resetBooking();
  } else if (button.dataset.cancel) {
    cancelAppointment(button);
  }
});

// Campo de data: de hoje até 30 dias à frente
const dateInput = $('#date');
const range = getBookingRange();
dateInput.min = range.min;
dateInput.max = range.max;

dateInput.addEventListener('change', () => {
  state.time = null;
  state.confirmed = null;

  // Data digitada fora do prazo (passada ou distante demais): recusa e limpa o campo
  if (dateInput.value && !isDateAllowed(dateInput.value)) {
    showToast('Escolha uma data a partir de hoje, em até 30 dias.');
    dateInput.value = '';
    state.date = '';
  } else {
    state.date = dateInput.value;
  }
  renderAll();
});

$('#tel').addEventListener('input', (event) => {
  event.target.value = formatPhone(event.target.value);
});

// Início
seedExamples();
renderAll();
renderPanel();
if (location.hash === '#painel') showTab('painel');