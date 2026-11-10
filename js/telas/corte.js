import { db, tem } from '../app.js';
import { EMPRESA } from '../config.js';
import { h, num, data, chip, modal, confirmar, chamar, ler, cadastros, opcoes, toast, imprimirEtiquetas } from '../util.js';

const COR_STATUS = { 'Liberado para Corte': 'ok', 'Em Espera na Calandra': 'alerta', 'Em Calandra': 'info', 'Cortado': '', 'Cancelado': 'erro' };
let filtro = 'abertos';

export async function render(el) {
  const cad = await cadastros(db);
  let q = db.from('v_cortes').select('*').order('data', { ascending: false }).limit(200);
  if (filtro === 'abertos') q = q.in('status', ['Liberado para Corte', 'Em Espera na Calandra', 'Em Calandra']);
  if (filtro === 'cortados') q = q.eq('status', 'Cortado');
  const cortes = await ler(q);
  const pode = tem('corte');

  el.innerHTML = `
    <div class="cab"><div><h1>1 - Pedido de Corte</h1><p>Programe o corte; confirme quando estiver liberado para gerar sublotes e etiquetas.</p></div>
      ${pode ? '<button class="btn acento" id="novo">+ Novo pedido de corte</button>' : ''}</div>
    <div class="abas">
      <button data-f="abertos" class="${filtro === 'abertos' ? 'ativo' : ''}">A cortar</button>
      <button data-f="cortados" class="${filtro === 'cortados' ? 'ativo' : ''}">Cortados</button>
      <button data-f="todos" class="${filtro === 'todos' ? 'ativo' : ''}">Todos</button>
    </div>
    <div class="lista-cards">${cortes.map(c => cartao(c, pode)).join('') || '<div class="vazio">Nenhum pedido.</div>'}</div>`;

  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filtro = b.dataset.f; render(el); });
  el.querySelector('#novo')?.addEventListener('click', () => formCorte(cad, null, () => render(el)));
  el.querySelectorAll('[data-acao]').forEach(b => b.onclick = async () => {
    const c = cortes.find(x => x.id === b.dataset.id);
    if (b.dataset.acao === 'editar') formCorte(cad, c, () => render(el));
    if (b.dataset.acao === 'duplicar') formCorte(cad, { ...c, id: null }, () => render(el));
    if (b.dataset.acao === 'confirmar') telaConfirmar(c, () => render(el));
    if (b.dataset.acao === 'etiquetas') {
      const { data: r } = await db.from('cortes').select('etiquetas').eq('id', c.id).single();
      if (r?.etiquetas?.length) imprimirEtiquetas(r.etiquetas, EMPRESA); else toast('Sem etiquetas salvas.', 'erro');
    }
    if (b.dataset.acao === 'cancelar') {
      const motivo = prompt('Motivo do cancelamento:');
      if (!motivo) return;
      if (await chamar(db, 'cancelar_corte', { p_corte_id: c.id, p_motivo: motivo })) { toast('Pedido cancelado.', 'ok'); render(el); }
    }
  });
}

function cartao(c, pode) {
  const cores = (c.cores || []).map(x => `${h(x.cor)} <b>${x.folhas}</b>`).join(' · ');
  const tams = (c.tamanhos || []).map(x => `${h(x.tamanho)} <b>${x.riscos}</b>`).join(' · ');
  const aberto = ['Liberado para Corte', 'Em Espera na Calandra', 'Em Calandra'].includes(c.status);
  return `<div class="item">
    <div class="linha1"><div><div class="tit">Lote ${h(c.lote)}</div><div class="det">${h(c.produto)} · ${data(c.data)}</div></div>
      ${chip(c.status, COR_STATUS[c.status])}</div>
    <div class="det" style="margin-top:8px">${chip(c.tipo_calandra, 'acento')}</div>
    <div class="det" style="margin-top:6px">Folhas: ${cores}</div>
    <div class="det">Riscos: ${tams}</div>
    <div class="det">Previsto: <b>${num(c.total_pecas_previsto)}</b> peças</div>
    ${c.obs ? `<div class="det">Obs.: ${h(c.obs)}</div>` : ''}
    <div class="acoes" style="margin-top:10px">
      ${pode && c.status === 'Liberado para Corte' ? `<button class="btn pri peq" data-acao="confirmar" data-id="${c.id}">✂️ Cortar</button>` : ''}
      ${pode && aberto ? `<button class="btn peq" data-acao="editar" data-id="${c.id}">Editar</button>` : ''}
      ${c.status === 'Cortado' ? `<button class="btn peq" data-acao="etiquetas" data-id="${c.id}">🏷️ Etiquetas</button>` : ''}
      ${pode ? `<button class="btn peq" data-acao="duplicar" data-id="${c.id}">Duplicar</button>` : ''}
      ${pode && aberto ? `<button class="btn peq perigo" data-acao="cancelar" data-id="${c.id}">Cancelar</button>` : ''}
    </div></div>`;
}

function linhaCor(cad, v = {}) {
  return `<div class="linha-grade" data-tipo="cor">
    <label class="campo">Cor<select name="cor">${opcoes(cad.cores.filter(c => c.ativo || c.id === v.cor_id), v.cor_id)}</select></label>
    <label class="campo">Folhas<input type="number" name="folhas" min="1" step="1" value="${h(v.folhas ?? '')}" required></label>
    <button type="button" class="btn peq perigo" data-remove>×</button></div>`;
}
function linhaTam(cad, v = {}) {
  return `<div class="linha-grade" data-tipo="tam">
    <label class="campo">Tamanho<select name="tam">${opcoes(cad.tamanhos.filter(t => t.ativo || t.id === v.tamanho_id), v.tamanho_id)}</select></label>
    <label class="campo">Riscos<input type="number" name="riscos" min="1" step="1" value="${h(v.riscos ?? '')}" required></label>
    <button type="button" class="btn peq perigo" data-remove>×</button></div>`;
}

function formCorte(cad, c, depois) {
  const editar = !!(c && c.id);
  const corpo = `
    <form id="fc" class="grade">
      <div class="grade g2">
        <label class="campo">Produto<select name="produto" required>${opcoes(cad.produtos.filter(p => p.ativo || p.id === c?.produto_id), c?.produto_id)}</select></label>
        <label class="campo">Calandra<select name="tipo" ${editar ? 'disabled' : ''}>
          ${['CORTE CEGO', 'PEÇA A PEÇA', 'TECIDO CORRIDO'].map(t => `<option ${c?.tipo_calandra === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <div><h3>Cores e folhas</h3><div class="grade-corte" id="cores">${(c?.cores?.length ? c.cores : [{}]).map(v => linhaCor(cad, v)).join('')}</div>
        <button type="button" class="btn peq" id="add-cor" style="margin-top:6px">+ Cor</button></div>
      <div><h3>Tamanhos e riscos</h3><div class="grade-corte" id="tams">${(c?.tamanhos?.length ? c.tamanhos : [{}]).map(v => linhaTam(cad, v)).join('')}</div>
        <button type="button" class="btn peq" id="add-tam" style="margin-top:6px">+ Tamanho</button></div>
      <label class="campo">Observação<input name="obs" value="${h(c?.obs || '')}"></label>
      <div class="ok-box" id="total"></div>
    </form>`;
  modal({
    titulo: editar ? `Editar lote ${c.lote}` : 'Novo pedido de corte', corpo, largo: true,
    aoAbrir: (m) => {
      const atualizar = () => {
        const f = [...m.querySelectorAll('[name=folhas]')].reduce((a, i) => a + (+i.value || 0), 0);
        const r = [...m.querySelectorAll('[name=riscos]')].reduce((a, i) => a + (+i.value || 0), 0);
        m.querySelector('#total').innerHTML = `Total previsto: <b>${num(f * r)}</b> peças (${num(f)} folhas × ${num(r)} riscos)`;
      };
      m.addEventListener('input', atualizar);
      m.addEventListener('click', (e) => { if (e.target.matches('[data-remove]')) { const g = e.target.closest('.grade-corte'); if (g.children.length > 1) e.target.parentElement.remove(); atualizar(); } });
      m.querySelector('#add-cor').onclick = () => { if (m.querySelectorAll('#cores > div').length < 12) m.querySelector('#cores').insertAdjacentHTML('beforeend', linhaCor(cad)); };
      m.querySelector('#add-tam').onclick = () => { if (m.querySelectorAll('#tams > div').length < 8) m.querySelector('#tams').insertAdjacentHTML('beforeend', linhaTam(cad)); };
      atualizar();
    },
    botoes: [{ texto: 'Cancelar' }, {
      texto: editar ? 'Salvar' : 'Criar pedido', classe: 'pri', acao: async (m) => {
        const f = m.querySelector('#fc');
        if (!f.reportValidity()) return false;
        const cores = [...m.querySelectorAll('#cores > div')].map(d => ({ cor_id: +d.querySelector('[name=cor]').value, folhas: +d.querySelector('[name=folhas]').value }));
        const tamanhos = [...m.querySelectorAll('#tams > div')].map(d => ({ tamanho_id: +d.querySelector('[name=tam]').value, riscos: +d.querySelector('[name=riscos]').value }));
        if (cores.some(x => !x.cor_id) || tamanhos.some(x => !x.tamanho_id)) { toast('Selecione todas as cores e tamanhos.', 'erro'); return false; }
        if (new Set(cores.map(x => x.cor_id)).size !== cores.length || new Set(tamanhos.map(x => x.tamanho_id)).size !== tamanhos.length) { toast('Cor ou tamanho repetido.', 'erro'); return false; }
        const produto = +f.produto.value, obs = f.obs.value || null;
        const r = editar
          ? await chamar(db, 'editar_corte', { p_corte_id: c.id, p_produto_id: produto, p_cores: cores, p_tamanhos: tamanhos, p_obs: obs })
          : await chamar(db, 'criar_corte', { p_produto_id: produto, p_tipo_calandra: f.tipo.value, p_cores: cores, p_tamanhos: tamanhos, p_obs: obs });
        if (!r) return false;
        toast(editar ? 'Pedido atualizado.' : 'Pedido criado.', 'ok'); depois();
      }
    }]
  });
}

function telaConfirmar(c, depois) {
  const linhas = [];
  for (const cor of c.cores) for (const t of c.tamanhos) linhas.push({ cor, t });
  const corpo = `
    <p>Confira as folhas e os riscos reais antes de confirmar. Cada cor × tamanho vira um sublote; cada risco vira uma etiqueta.</p>
    <div class="grade g2">
      <div><h3>Folhas por cor</h3>${c.cores.map(x => `<label class="campo">${h(x.cor)}<input type="number" min="1" step="1" data-cor="${x.posicao}" value="${x.folhas}"></label>`).join('')}</div>
      <div><h3>Riscos por tamanho</h3>${c.tamanhos.map(x => `<label class="campo">${h(x.tamanho)}<input type="number" min="1" step="1" data-tam="${x.posicao}" value="${x.riscos}"></label>`).join('')}</div>
    </div>
    <div class="tabela-wrap" style="margin-top:12px"><table><thead><tr><th>Cor</th><th>Tamanho</th><th class="n">Peças</th><th class="n">Etiquetas</th></tr></thead><tbody id="prev"></tbody></table></div>`;
  modal({
    titulo: `Cortar lote ${c.lote} — ${c.produto}`, corpo, largo: true,
    aoAbrir: (m) => {
      const atualizar = () => {
        let tp = 0, te = 0;
        m.querySelector('#prev').innerHTML = linhas.map(({ cor, t }) => {
          const fo = +m.querySelector(`[data-cor="${cor.posicao}"]`).value || 0, ri = +m.querySelector(`[data-tam="${t.posicao}"]`).value || 0;
          tp += fo * ri; te += ri;
          return `<tr><td>${h(cor.cor)}</td><td>${h(t.tamanho)}</td><td class="n">${num(fo * ri)}</td><td class="n">${ri}</td></tr>`;
        }).join('') + `<tr class="grupo"><td colspan="2">Total</td><td class="n">${num(tp)}</td><td class="n">${num(te)}</td></tr>`;
      };
      m.addEventListener('input', atualizar); atualizar();
    },
    botoes: [{ texto: 'Cancelar' }, {
      texto: 'Confirmar corte e gerar etiquetas', classe: 'pri', acao: async (m) => {
        const ajustes = {
          cores: [...m.querySelectorAll('[data-cor]')].map(i => ({ posicao: +i.dataset.cor, folhas: +i.value })),
          tamanhos: [...m.querySelectorAll('[data-tam]')].map(i => ({ posicao: +i.dataset.tam, riscos: +i.value })),
        };
        if ([...ajustes.cores.map(x => x.folhas), ...ajustes.tamanhos.map(x => x.riscos)].some(v => !(v > 0))) { toast('Valores devem ser maiores que zero.', 'erro'); return false; }
        if (!await confirmar('Confirmar corte', `Gravar o corte do lote <b>${h(c.lote)}</b>? Depois de confirmado não pode ser desfeito.`)) return false;
        const r = await chamar(db, 'confirmar_corte', { p_corte_id: c.id, p_ajustes: ajustes });
        if (!r) return false;
        toast(r.mensagem, 'ok'); depois();
        if (r.etiquetas?.length && await confirmar('Etiquetas', `${r.etiquetas.length} etiquetas prontas. Imprimir agora?`, 'Imprimir')) imprimirEtiquetas(r.etiquetas, EMPRESA);
      }
    }]
  });
}
