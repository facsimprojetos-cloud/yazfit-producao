import { db, tem, ctx } from '../app.js';
import { h, num, moeda, data, chip, modal, chamar, ler, cadastros, opcoes, toast, token, hojeISO, confirmar, pedirTexto } from '../util.js';

let aba = 'abertos';
let fFac = '';
const marcados = new Set();

export async function render(el) {
  const pode = tem('financeiro');
  const cad = await cadastros(db);
  el.innerHTML = `
    <div class="cab"><div><h1>Fechamento de Facção</h1><p>Pague os retornos conferidos. Valor = (retornado − defeito) × preço da parte.</p></div></div>
    <div class="abas">
      <button data-a="abertos" class="${aba === 'abertos' ? 'ativo' : ''}">A pagar</button>
      <button data-a="revisar" class="${aba === 'revisar' ? 'ativo' : ''}">Pendências</button>
      <button data-a="pagos" class="${aba === 'pagos' ? 'ativo' : ''}">Pagamentos realizados</button>
    </div>
    <div class="filtros"><label class="campo">Facção<select id="ff">${opcoes(cad.faccoes, fFac, 'nome', 'id', aba === 'abertos' ? 'Selecione a facção…' : 'Todas')}</select></label></div>
    <div id="alvo"></div>`;
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { aba = b.dataset.a; marcados.clear(); render(el); });
  el.querySelector('#ff').onchange = (e) => { fFac = e.target.value; marcados.clear(); render(el); };
  const alvo = el.querySelector('#alvo');

  if (aba === 'pagos') {
    let q = db.from('v_fechamentos').select('*').order('criado_em', { ascending: false }).limit(300);
    if (fFac) q = q.eq('faccao_id', +fFac);
    const pg = await ler(q);
    alvo.innerHTML = `<div class="tabela-wrap"><table><thead><tr><th>Código</th><th>Pagamento</th><th>Facção</th><th class="n">Itens</th><th class="n">Bruto</th><th class="n">Desconto</th><th class="n">Pago</th><th>Responsável</th><th>Comprovante</th><th></th></tr></thead>
      <tbody>${pg.map(p => `<tr><td class="forte">${h(p.codigo)}</td><td>${data(p.data_pagamento)}</td><td>${h(p.faccao)}</td><td class="n">${p.itens}</td>
        <td class="n">${moeda(p.valor_bruto)}</td><td class="n">${moeda(p.desconto)}</td><td class="n forte">${moeda(p.valor_pago)}</td><td>${h(p.responsavel)}</td>
        <td>${p.comprovante_url ? `<a href="${h(p.comprovante_url)}" target="_blank" rel="noopener">abrir</a>` : ''}</td>
        <td><div class="acoes"><button class="btn peq" data-det="${p.id}">Detalhes</button>${tem('supervisor') ? `<button class="btn peq perigo" data-est="${p.id}">↩ Estornar</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="10" class="vazio">Nenhum pagamento.</td></tr>'}</tbody></table></div>`;
    alvo.querySelectorAll('[data-det]').forEach(b => b.onclick = () => detalhes(pg.find(p => p.id === b.dataset.det)));
    alvo.querySelectorAll('[data-est]').forEach(b => b.onclick = async () => {
      const p = pg.find(x => x.id === b.dataset.est);
      const motivo = await pedirTexto(`Estornar pagamento ${p.codigo}`, `Estornar o pagamento de <b>${moeda(p.valor_pago)}</b> para <b>${h(p.faccao)}</b>? Os ${p.itens} retorno(s) voltam para "A pagar".`, { botao: 'Estornar', minimo: 5 });
      if (motivo && await chamar(db, 'estornar_fechamento', { p_fechamento_id: p.id, p_motivo: motivo })) { toast('Pagamento estornado.', 'ok'); render(el); }
    });
    return;
  }

  let q = db.from('v_retornos').select('*').order('data_retorno');
  q = aba === 'abertos' ? q.eq('situacao', 'ABERTO') : q.in('situacao', ['REVISAR', 'A CONFERIR']);
  if (fFac) q = q.eq('faccao_id', +fFac);
  if (aba === 'abertos' && !fFac) {
    const resumo = await ler(db.from('v_retornos').select('faccao_id,faccao,valor_a_pagar').eq('situacao', 'ABERTO'));
    const porFac = new Map();
    resumo.forEach(r => { const x = porFac.get(r.faccao_id) || { nome: r.faccao, n: 0, v: 0 }; x.n++; x.v += Number(r.valor_a_pagar); porFac.set(r.faccao_id, x); });
    alvo.innerHTML = `<div class="lista-cards">${[...porFac.entries()].map(([id, x]) => `<div class="item"><div class="tit">${h(x.nome)}</div>
      <div class="det">${x.n} retorno(s) conferido(s)</div><div style="font-size:1.4rem;font-weight:900;margin:6px 0">${moeda(x.v)}</div>
      <button class="btn pri peq" data-fac="${id}">Abrir</button></div>`).join('') || '<div class="vazio">Nada a pagar.</div>'}</div>`;
    alvo.querySelectorAll('[data-fac]').forEach(b => b.onclick = () => { fFac = b.dataset.fac; render(el); });
    return;
  }
  const lista = await ler(q);
  const total = () => lista.filter(r => marcados.has(r.id)).reduce((a, r) => a + Number(r.valor_a_pagar), 0);
  alvo.innerHTML = `
    <div class="tabela-wrap"><table><thead><tr>${aba === 'abertos' && pode ? '<th><input type="checkbox" id="todos"></th>' : ''}<th>Lote</th><th>Produto</th><th>Cor/Tam</th><th>Retorno</th><th>Conferência</th>
      <th class="n">Cima</th><th class="n">Baixo</th><th class="n">Defeito</th><th>Conserto</th><th class="n">R$ cima</th><th class="n">R$ baixo</th><th class="n">Valor</th>${aba !== 'abertos' ? '<th>Motivo</th>' : ''}</tr></thead>
      <tbody>${lista.map(r => `<tr>${aba === 'abertos' && pode ? `<td><input type="checkbox" data-m="${r.id}" ${marcados.has(r.id) ? 'checked' : ''}></td>` : ''}
        <td>${h(r.lote)}</td><td>${h(r.produto)}</td><td>${h(r.cor || '')} / ${h(r.tamanho || '')}</td><td>${data(r.data_retorno)}</td><td>${data(r.data_conferencia) || '—'}</td>
        <td class="n">${r.ret_cima}</td><td class="n">${r.ret_baixo}</td><td class="n">${r.def_cima + r.def_baixo}</td>
        <td>${conserto(r)}</td>
        <td class="n">${r.valor_cima != null ? moeda(r.valor_cima) : '—'}</td><td class="n">${r.valor_baixo != null ? moeda(r.valor_baixo) : '—'}</td>
        <td class="n forte">${moeda(r.valor_a_pagar)}</td>${aba !== 'abertos' ? `<td>${chip(r.motivo || r.situacao, 'alerta')}</td>` : ''}</tr>`).join('')
        || '<tr><td colspan="14" class="vazio">Nada aqui.</td></tr>'}</tbody></table></div>
    ${aba === 'abertos' && pode ? `<div class="card" style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div>Selecionados: <b id="qs">${marcados.size}</b> · Total bruto: <b id="ts">${moeda(total())}</b>
        <div class="peq" id="cs" style="color:var(--alerta)"></div></div>
      <button class="btn acento" id="pagar" ${marcados.size ? '' : 'disabled'}>Registrar pagamento</button></div>` : ''}`;
  const atualizar = () => {
    alvo.querySelector('#qs').textContent = marcados.size; alvo.querySelector('#ts').textContent = moeda(total());
    const emCons = lista.filter(r => marcados.has(r.id) && r.conserto_status === 'Em conserto').reduce((a, r) => a + r.conserto_qtd, 0);
    alvo.querySelector('#cs').textContent = emCons ? `Atenção: ${emCons} peça(s) destes retornos ainda estão em conserto na facção.` : '';
    alvo.querySelector('#pagar').disabled = !marcados.size;
  };
  alvo.querySelectorAll('[data-m]').forEach(cb => cb.onchange = () => { cb.checked ? marcados.add(cb.dataset.m) : marcados.delete(cb.dataset.m); atualizar(); });
  alvo.querySelector('#todos')?.addEventListener('change', (e) => {
    alvo.querySelectorAll('[data-m]').forEach(cb => { cb.checked = e.target.checked; cb.checked ? marcados.add(cb.dataset.m) : marcados.delete(cb.dataset.m); }); atualizar();
  });
  alvo.querySelector('#pagar')?.addEventListener('click', () => pagar(lista.filter(r => marcados.has(r.id)), () => { marcados.clear(); render(el); }));
}

function pagar(itens, depois) {
  const bruto = itens.reduce((a, r) => a + Number(r.valor_a_pagar), 0);
  const tk = token();
  modal({
    titulo: `Pagamento — ${itens[0].faccao}`,
    corpo: `<p>${itens.length} retorno(s) · valor bruto <b>${moeda(bruto)}</b></p>
      ${(() => { const c = itens.filter(r => r.conserto_qtd > 0); if (!c.length) return '';
        const pend = c.filter(r => r.conserto_status === 'Em conserto').reduce((a, r) => a + r.conserto_qtd, 0);
        const rec = c.filter(r => r.conserto_status === 'Conserto recebido').reduce((a, r) => a + r.conserto_qtd, 0);
        return `<div class="aviso-box">Consertos nestes retornos: ${pend ? `<b>${pend} peça(s) ainda em conserto</b>` : ''}${pend && rec ? ' · ' : ''}${rec ? `${rec} peça(s) de conserto já recebidas` : ''}.</div>`; })()}
      <div class="grade g2">
        <label class="campo">Data do pagamento<input type="date" id="dp" value="${hojeISO()}"></label>
        <label class="campo">Desconto (R$)<input type="number" id="ds" min="0" step="0.01" value="0"></label>
        <label class="campo">Responsável<input id="rs" value="${h(ctx.nome)}"></label>
        <label class="campo">Link do comprovante (opcional)<input id="cp" placeholder="https://…"></label>
      </div>
      <label class="campo" style="margin-top:8px">Observação<input id="ob"></label>
      <div class="ok-box" id="liq" style="margin-top:10px"></div>`,
    aoAbrir: (m) => { const at = () => { m.querySelector('#liq').innerHTML = `Valor a pagar: <b>${moeda(bruto - (+m.querySelector('#ds').value || 0))}</b>`; }; m.addEventListener('input', at); at(); },
    botoes: [{ texto: 'Cancelar' }, {
      texto: 'Confirmar pagamento', classe: 'pri', acao: async (m) => {
        const ds = +m.querySelector('#ds').value || 0, liq = Math.round((bruto - ds) * 100) / 100;
        if (ds < 0 || ds > bruto) { toast('Desconto inválido.', 'erro'); return false; }
        if (!await confirmar('Confirmar pagamento', `Registrar pagamento de <b>${moeda(liq)}</b> para <b>${h(itens[0].faccao)}</b>?`)) return false;
        const r = await chamar(db, 'registrar_fechamento', {
          p_faccao_id: itens[0].faccao_id, p_retorno_ids: itens.map(x => x.id), p_data_pagamento: m.querySelector('#dp').value,
          p_desconto: ds, p_responsavel: m.querySelector('#rs').value, p_token: tk, p_valor_pago_esperado: liq,
          p_obs: m.querySelector('#ob').value || null, p_comprovante_url: m.querySelector('#cp').value || null });
        if (!r) return false;
        toast(`Pagamento ${r.codigo} registrado: ${moeda(r.valor_pago)}.`, 'ok'); depois();
      }
    }]
  });
}

async function detalhes(p) {
  const itens = await ler(db.from('v_retornos').select('*').eq('fechamento_id', p.id));
  modal({
    titulo: `${p.codigo} — ${p.faccao}`, largo: true,
    corpo: `<p>Pago em ${data(p.data_pagamento)} por ${h(p.responsavel)} · bruto ${moeda(p.valor_bruto)} · desconto ${moeda(p.desconto)} · <b>pago ${moeda(p.valor_pago)}</b></p>
      ${p.obs ? `<p>Obs.: ${h(p.obs)}</p>` : ''}
      <div class="tabela-wrap"><table><thead><tr><th>Lote</th><th>Produto</th><th>Cor/Tam</th><th class="n">Cima</th><th class="n">Baixo</th><th class="n">Defeito</th><th>Conserto</th><th class="n">Bruto</th><th class="n">Pago</th></tr></thead>
      <tbody>${itens.map(r => `<tr><td>${h(r.lote)}</td><td>${h(r.produto)}</td><td>${h(r.cor || '')} / ${h(r.tamanho || '')}</td><td class="n">${r.ret_cima}</td><td class="n">${r.ret_baixo}</td>
        <td class="n">${r.def_cima + r.def_baixo}</td><td>${conserto(r)}</td><td class="n">${moeda(r.valor_a_pagar)}</td><td class="n">${moeda(r.valor_pago)}</td></tr>`).join('')}</tbody></table></div>`,
    botoes: [{ texto: 'Fechar' }]
  });
}

// Conserto do retorno: quantidade + situação (em conserto / recebido)
function conserto(r) {
  if (!r.conserto_qtd) return '<span class="muted">—</span>';
  return r.conserto_status === 'Em conserto'
    ? chip(`${r.conserto_qtd} em conserto`, 'alerta')
    : chip(`${r.conserto_qtd} recebido${r.conserto_recebido_em ? ' ' + data(r.conserto_recebido_em) : ''}`, 'ok');
}
