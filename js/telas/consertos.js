import { db, tem } from '../app.js';
import { h, num, data, chip, chamar, ler, toast, hojeISO, confirmar, modal } from '../util.js';

let aba = 'pendentes';

export async function render(el) {
  const pode = tem('faccao');
  const sup = tem('supervisor');
  let q = db.from('v_consertos').select('*').order('data', { ascending: false }).limit(500);
  q = aba === 'pendentes' ? q.is('data_recebido', null) : q.not('data_recebido', 'is', null);
  const lista = await ler(q);
  const grupos = new Map();
  lista.forEach(c => { if (!grupos.has(c.faccao)) grupos.set(c.faccao, []); grupos.get(c.faccao).push(c); });
  el.innerHTML = `
    <div class="cab"><div><h1>3 - Consertos</h1><p>Peças devolvidas para conserto nas facções.</p></div></div>
    <div class="abas">
      <button data-a="pendentes" class="${aba === 'pendentes' ? 'ativo' : ''}">Pendentes</button>
      <button data-a="recebidos" class="${aba === 'recebidos' ? 'ativo' : ''}">Recebidos</button>
    </div>
    <div class="tabela-wrap"><table>
      <thead><tr><th>Data</th><th>Lote</th><th>Produto</th><th>Cor</th><th>Tam.</th><th class="n">Qtd</th><th>Partes</th><th>Obs.</th><th>${aba === 'pendentes' ? '' : 'Recebido'}</th></tr></thead>
      <tbody>${[...grupos.entries()].map(([fac, itens]) => `
        <tr class="grupo"><td colspan="9">${h(fac)} · ${num(itens.reduce((a, c) => a + c.qtd, 0))} peça(s)</td></tr>
        ${itens.map(c => `<tr><td>${data(c.data)}</td><td>${h(c.lote)}</td><td>${h(c.produto)}</td><td>${h(c.cor || '')}</td><td>${h(c.tamanho || '')}</td>
          <td class="n forte">${num(c.qtd)}</td><td>${chip(c.partes || '')}</td><td class="peq">${h(c.obs || '')}</td>
          <td>${aba === 'pendentes' ? (pode ? `<button class="btn pri peq" data-rec="${c.id}">Recebido</button>` : '') : `${data(c.data_recebido)} ${sup ? `<button class="btn peq" data-desf="${c.id}">Desfazer</button>` : ''}`}</td></tr>`).join('')}`).join('')
        || '<tr><td colspan="9" class="vazio">Nenhum conserto.</td></tr>'}</tbody></table></div>`;
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { aba = b.dataset.a; render(el); });
  el.querySelectorAll('[data-desf]').forEach(b => b.onclick = async () => {
    if (!await confirmar('Desfazer recebimento', 'O conserto volta para Pendentes.', 'Desfazer')) return;
    if (await chamar(db, 'desfazer_recebimento_conserto', { p_conserto_id: b.dataset.desf })) { toast('Recebimento desfeito.', 'ok'); render(el); }
  });
  el.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => {
    const c = lista.find(x => x.id === b.dataset.rec);
    modal({
      titulo: 'Conserto recebido',
      corpo: `<p><b>${num(c.qtd)}</b> peça(s) de <b>${h(c.produto)}</b> ${h(c.cor || '')} ${h(c.tamanho || '')} — ${h(c.faccao)}</p>
        <label class="campo">Data do recebimento<input type="date" id="dt" value="${hojeISO()}" max="${hojeISO()}"></label>`,
      botoes: [{ texto: 'Cancelar' }, { texto: 'Confirmar recebimento', classe: 'pri', acao: async (m) => {
        const dt = m.querySelector('#dt').value;
        if (!dt) { toast('Informe a data.', 'erro'); return false; }
        if (!await chamar(db, 'receber_conserto', { p_conserto_id: c.id, p_data: dt })) return false;
        toast('Conserto recebido.', 'ok'); render(el);
      } }]
    });
  });
}
