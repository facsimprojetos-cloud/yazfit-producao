import { db, tem } from '../app.js';
import { PREVISAO_DIAS } from '../config.js';
import { h, num, moeda, chip, modal, chamar, ler, cadastros, opcoes, toast, token, hojeISO, confirmar } from '../util.js';
import { imprimirRomaneio } from '../romaneio.js';

const COR = { 'AGUARDANDO SEPARAÇÃO': 'info', 'SEPARADO PARCIALMENTE': 'alerta', 'SEPARADO': 'ok', 'AGUARDANDO CALANDRA': 'erro', 'EM CALANDRA': 'erro' };
let aba = 'separar';
let busca = '';
const selecionados = new Map(); // sublote_id -> qtd

export async function render(el) {
  let q = db.from('v_sublotes').select('*').order('criado_em', { ascending: false }).order('codigo').limit(500);
  if (aba === 'separar') q = q.eq('disponivel_envio', true);
  if (aba === 'calandra') q = q.in('status_calandra', ['Aguardando Calandra', 'Em Calandra']);
  if (aba === 'separados') q = q.eq('qtd_saldo', 0);
  const lista = await ler(q);
  const pode = tem('faccao');
  const filtrada = lista.filter(s => !busca || [s.codigo, s.lote, s.produto, s.cor, s.tamanho].join(' ').toLowerCase().includes(busca.toLowerCase()));
  for (const id of selecionados.keys()) if (!lista.some(s => s.id === id && s.disponivel_envio)) selecionados.delete(id);

  // agrupa por lote
  const grupos = new Map();
  filtrada.forEach(s => { if (!grupos.has(s.lote)) grupos.set(s.lote, []); grupos.get(s.lote).push(s); });

  el.innerHTML = `
    <div class="cab"><div><h1>2 - Lotes de Produção</h1><p>Selecione os sublotes e envie para a facção (gera o romaneio).</p></div>
      ${pode && aba === 'separar' ? `<button class="btn acento" id="enviar" ${selecionados.size ? '' : 'disabled'}>Enviar para facção (${selecionados.size})</button>` : ''}</div>
    <div class="abas">
      <button data-a="separar" class="${aba === 'separar' ? 'ativo' : ''}">Aguardando separação</button>
      <button data-a="calandra" class="${aba === 'calandra' ? 'ativo' : ''}">Na calandra</button>
      <button data-a="separados" class="${aba === 'separados' ? 'ativo' : ''}">Separados</button>
    </div>
    <div class="filtros"><label class="campo">Buscar<input id="busca" value="${h(busca)}" placeholder="Lote, produto, cor…"></label></div>
    <div class="tabela-wrap"><table>
      <thead><tr>${aba === 'separar' && pode ? '<th></th>' : ''}<th>Sublote</th><th>Produto</th><th>Cor</th><th>Tam.</th><th class="n">Cortado</th><th class="n">Saldo</th><th class="n">Facção</th><th>Status</th>${aba === 'separar' && pode ? '<th class="n">Enviar</th>' : ''}</tr></thead>
      <tbody>${[...grupos.entries()].map(([lote, itens]) => `
        <tr class="grupo"><td colspan="${aba === 'separar' && pode ? 10 : 8}">Lote ${h(lote)} · ${num(itens.reduce((a, s) => a + s.qtd_saldo, 0))} peças em saldo</td></tr>
        ${itens.map(s => `<tr>
          ${aba === 'separar' && pode ? `<td><input type="checkbox" data-sel="${s.id}" ${selecionados.has(s.id) ? 'checked' : ''}></td>` : ''}
          <td class="forte">${h(s.codigo)}</td><td>${h(s.produto)}</td><td>${h(s.cor || '')}</td><td>${h(s.tamanho || '')}</td>
          <td class="n">${num(s.qtd_cortada)}</td><td class="n forte">${num(s.qtd_saldo)}</td><td class="n">${num(s.qtd_faccao + s.qtd_interna)}</td>
          <td>${chip(s.status_lote, COR[s.status_lote])}</td>
          ${aba === 'separar' && pode ? `<td class="n"><input class="inp num" type="number" min="1" max="${s.qtd_saldo}" data-qtd="${s.id}" value="${selecionados.get(s.id) ?? s.qtd_saldo}"></td>` : ''}
        </tr>`).join('')}`).join('') || `<tr><td colspan="10" class="vazio">Nada por aqui.</td></tr>`}
      </tbody></table></div>`;

  el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { aba = b.dataset.a; render(el); });
  const inpBusca = el.querySelector('#busca');
  inpBusca.onchange = () => { busca = inpBusca.value; render(el); };
  const btnEnviar = el.querySelector('#enviar');
  const atualizarBotao = () => { if (btnEnviar) { btnEnviar.disabled = !selecionados.size; btnEnviar.textContent = `Enviar para facção (${selecionados.size})`; } };
  el.querySelectorAll('[data-sel]').forEach(cb => cb.onchange = () => {
    const id = cb.dataset.sel, qi = el.querySelector(`[data-qtd="${id}"]`);
    if (cb.checked) selecionados.set(id, +qi.value); else selecionados.delete(id);
    atualizarBotao();
  });
  el.querySelectorAll('[data-qtd]').forEach(i => i.oninput = () => {
    const id = i.dataset.qtd; if (selecionados.has(id)) selecionados.set(id, +i.value);
  });
  btnEnviar?.addEventListener('click', () => telaEnvio(lista.filter(s => selecionados.has(s.id)), () => render(el)));
}

async function telaEnvio(itens, depois) {
  const cad = await cadastros(db);
  const previsao = new Date(Date.now() + PREVISAO_DIAS * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const tk = token();
  const corpo = `
    <div class="grade g2">
      <label class="campo">Facção<select id="fac">${opcoes(cad.faccoes.filter(f => f.ativo), null)}</select></label>
      <label class="campo">Previsão de retorno<input type="date" id="prev" value="${previsao}" min="${hojeISO()}"></label>
    </div>
    <div class="tabela-wrap" style="margin-top:12px"><table>
      <thead><tr><th>Sublote</th><th>Produto</th><th>Cor/Tam</th><th class="n">Qtd</th><th class="n">R$ cima</th><th class="n">R$ baixo</th><th class="n">Total</th></tr></thead>
      <tbody>${itens.map(s => {
        const conj = s.classificacao === 'Conjunto';
        const temC = conj || s.valor_cima != null, temB = conj || s.valor_baixo != null;
        return `<tr data-id="${s.id}">
          <td>${h(s.codigo)}</td><td>${h(s.produto)}</td><td>${h(s.cor || '')} / ${h(s.tamanho || '')}</td>
          <td class="n"><input class="inp num" type="number" min="1" max="${s.qtd_saldo}" data-campo="qtd" value="${selecionados.get(s.id) || s.qtd_saldo}"></td>
          <td class="n">${temC || !temB ? `<input class="inp num" type="number" min="0" step="0.01" data-campo="vc" value="${s.valor_cima ?? ''}">` : '—'}</td>
          <td class="n">${temB ? `<input class="inp num" type="number" min="0" step="0.01" data-campo="vb" value="${s.valor_baixo ?? ''}">` : '—'}</td>
          <td class="n" data-total></td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr class="grupo"><td colspan="3">Total</td><td class="n" id="tq"></td><td colspan="2"></td><td class="n" id="tv"></td></tr></tfoot></table></div>
    <label class="campo" style="margin-top:10px">Observação<input id="obs"></label>`;
  modal({
    titulo: 'Enviar para facção', corpo, largo: true,
    aoAbrir: (m) => {
      const atualizar = () => {
        let tq = 0, tv = 0;
        m.querySelectorAll('tbody tr').forEach(tr => {
          const q = +tr.querySelector('[data-campo=qtd]').value || 0;
          const vc = +(tr.querySelector('[data-campo=vc]')?.value || 0), vb = +(tr.querySelector('[data-campo=vb]')?.value || 0);
          tr.querySelector('[data-total]').textContent = moeda(q * (vc + vb)); tq += q; tv += q * (vc + vb);
        });
        m.querySelector('#tq').textContent = num(tq); m.querySelector('#tv').textContent = moeda(tv);
      };
      m.addEventListener('input', atualizar); atualizar();
    },
    botoes: [{ texto: 'Cancelar' }, {
      texto: 'Confirmar envio', classe: 'pri', acao: async (m) => {
        const fac = +m.querySelector('#fac').value;
        if (!fac) { toast('Selecione a facção.', 'erro'); return false; }
        const lista = [...m.querySelectorAll('tbody tr')].map(tr => {
          const vc = tr.querySelector('[data-campo=vc]'), vb = tr.querySelector('[data-campo=vb]');
          return { sublote_id: tr.dataset.id, qtd: +tr.querySelector('[data-campo=qtd]').value,
            valor_cima: vc && vc.value !== '' ? +vc.value : null, valor_baixo: vb && vb.value !== '' ? +vb.value : null };
        });
        const nomeFac = m.querySelector('#fac').selectedOptions[0].textContent;
        if (!await confirmar('Confirmar envio', `Enviar <b>${num(lista.reduce((a, x) => a + x.qtd, 0))}</b> peças para <b>${h(nomeFac)}</b>?`)) return false;
        const r = await chamar(db, 'enviar_faccao', { p_faccao_id: fac, p_itens: lista, p_token: tk, p_previsao: m.querySelector('#prev').value || null, p_obs: m.querySelector('#obs').value || null });
        if (!r) return false;
        selecionados.clear();
        toast(r.ja_processado ? 'Envio já havia sido registrado.' : `Enviado: ${num(r.qtd_total)} peças (${moeda(r.valor_total)}).`, 'ok');
        depois();
        if (await confirmar('Romaneio', 'Imprimir o romaneio deste envio?', 'Imprimir')) imprimirRomaneio(r.remessa_id);
      }
    }]
  });
}
