import { db, tem, ctx } from '../app.js';
import { h, num, moeda, data, chip, modal, chamar, ler, cadastros, opcoes, toast, token, hojeISO, confirmar, pedirTexto } from '../util.js';

// Regra (como a YAZFIT trabalha):
//  • Retorno: paga (retornadas − defeito − conserto) × preço da parte. Defeito não é pago.
//  • Conserto: vai para a aba Consertos e só é pago quando volta consertado (botão "Recebido").
let aba = 'abertos';
let fFac = '';
const marcados = new Set();   // 'r:<id>' = retorno · 'c:<id>' = conserto

export async function render(el) {
  const pode = tem('financeiro');
  const cad = await cadastros(db);
  el.innerHTML = `
    <div class="cab"><div><h1>Fechamento de Facção</h1>
      <p>Retorno = (retornadas − defeito − conserto) × preço da parte. O conserto é pago quando volta consertado.</p></div></div>
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

  if (aba === 'pagos') return renderPagos(alvo, el);
  if (aba === 'revisar') return renderPendencias(alvo);

  // ---------- A PAGAR ----------
  if (!fFac) {
    const [rets, cons] = await Promise.all([
      ler(db.from('v_retornos').select('faccao_id,faccao,valor_a_pagar').eq('situacao', 'ABERTO')),
      ler(db.from('v_consertos').select('faccao_id,faccao,valor').eq('situacao_pagamento', 'ABERTO')),
    ]);
    const porFac = new Map();
    const pega = (id, nome) => { if (!porFac.has(id)) porFac.set(id, { nome, nr: 0, nc: 0, v: 0 }); return porFac.get(id); };
    rets.forEach(r => { const x = pega(r.faccao_id, r.faccao); x.nr++; x.v += Number(r.valor_a_pagar); });
    cons.forEach(c => { const x = pega(c.faccao_id, c.faccao); x.nc++; x.v += Number(c.valor); });
    alvo.innerHTML = `<div class="lista-cards">${[...porFac.entries()].sort((a, b) => b[1].v - a[1].v).map(([id, x]) => `<div class="item"><div class="tit">${h(x.nome)}</div>
      <div class="det">${x.nr ? `${x.nr} retorno(s) conferido(s)` : ''}${x.nr && x.nc ? ' · ' : ''}${x.nc ? `${x.nc} conserto(s) recebido(s)` : ''}</div>
      <div style="font-size:1.4rem;font-weight:900;margin:6px 0">${moeda(x.v)}</div>
      <button class="btn pri peq" data-fac="${id}">Abrir</button></div>`).join('') || '<div class="vazio">Nada a pagar.</div>'}</div>`;
    alvo.querySelectorAll('[data-fac]').forEach(b => b.onclick = () => { fFac = b.dataset.fac; render(el); });
    return;
  }

  const [rets, cons, emConserto] = await Promise.all([
    ler(db.from('v_retornos').select('*').eq('situacao', 'ABERTO').eq('faccao_id', +fFac).order('data_retorno')),
    ler(db.from('v_consertos').select('*').eq('situacao_pagamento', 'ABERTO').eq('faccao_id', +fFac).order('data_recebido')),
    ler(db.from('v_consertos').select('qtd,valor').eq('situacao_pagamento', 'EM CONSERTO').eq('faccao_id', +fFac)),
  ]);
  const valorDe = (k) => k.startsWith('r:') ? Number(rets.find(r => 'r:' + r.id === k)?.valor_a_pagar || 0) : Number(cons.find(c => 'c:' + c.id === k)?.valor || 0);
  const total = () => [...marcados].reduce((a, k) => a + valorDe(k), 0);
  const ck = (k) => pode ? `<td><input type="checkbox" data-m="${k}" ${marcados.has(k) ? 'checked' : ''}></td>` : '';

  alvo.innerHTML = `
    ${emConserto.length ? `<div class="aviso-box">Esta facção ainda tem <b>${num(emConserto.reduce((a, c) => a + c.qtd, 0))}</b> peça(s) em conserto
      (${moeda(emConserto.reduce((a, c) => a + Number(c.valor), 0))}). Serão pagas quando voltarem consertadas.</div>` : ''}
    <h2 style="margin-top:6px">Retornos conferidos</h2>
    <div class="tabela-wrap"><table><thead><tr>${pode ? '<th><input type="checkbox" data-todos="r"></th>' : ''}<th>Lote</th><th>Produto</th><th>Cor/Tam</th><th>Retorno</th>
      <th class="n">Retornadas</th><th class="n">Defeito</th><th class="n">Conserto</th><th class="n">Pagas agora</th><th class="n">Preço</th><th class="n">Valor</th></tr></thead>
      <tbody>${rets.map(r => {
        const ret = r.ret_cima + r.ret_baixo, def = r.def_cima + r.def_baixo, co = r.cons_cima + r.cons_baixo;
        return `<tr>${ck('r:' + r.id)}<td>${h(r.lote)}</td><td>${h(r.produto)}</td><td>${h(r.cor || '')} / ${h(r.tamanho || '')}</td><td>${data(r.data_retorno)}</td>
        <td class="n">${ret}</td><td class="n">${def || '—'}</td><td class="n">${co ? chip(`${co} · paga ao voltar`, 'alerta') : '—'}</td>
        <td class="n forte">${Math.max(0, ret - def - co)}</td><td class="n">${preco(r)}</td><td class="n forte">${moeda(r.valor_a_pagar)}</td></tr>`;
      }).join('') || `<tr><td colspan="11" class="vazio">Nenhum retorno a pagar.</td></tr>`}</tbody></table></div>

    <h2 style="margin-top:16px">Consertos que voltaram</h2>
    <div class="tabela-wrap"><table><thead><tr>${pode ? '<th><input type="checkbox" data-todos="c"></th>' : ''}<th>Lote</th><th>Produto</th><th>Cor/Tam</th><th>Recebido em</th><th>Partes</th><th class="n">Peças</th><th class="n">Valor</th></tr></thead>
      <tbody>${cons.map(c => `<tr>${ck('c:' + c.id)}<td>${h(c.lote)}</td><td>${h(c.produto)}</td><td>${h(c.cor || '')} / ${h(c.tamanho || '')}</td>
        <td>${data(c.data_recebido)}</td><td>${h(c.partes || '')}</td><td class="n">${num(c.qtd)}</td><td class="n forte">${moeda(c.valor)}</td></tr>`).join('')
        || `<tr><td colspan="8" class="vazio">Nenhum conserto recebido a pagar.</td></tr>`}</tbody></table></div>

    ${pode ? `<div class="card" style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div>Selecionados: <b id="qs">${marcados.size}</b> · Total bruto: <b id="ts">${moeda(total())}</b></div>
      <button class="btn acento" id="pagar" ${marcados.size ? '' : 'disabled'}>Registrar pagamento</button></div>` : ''}`;

  const atualizar = () => {
    if (!alvo.querySelector('#qs')) return;
    alvo.querySelector('#qs').textContent = marcados.size; alvo.querySelector('#ts').textContent = moeda(total());
    alvo.querySelector('#pagar').disabled = !marcados.size;
  };
  alvo.querySelectorAll('[data-m]').forEach(cb => cb.onchange = () => { cb.checked ? marcados.add(cb.dataset.m) : marcados.delete(cb.dataset.m); atualizar(); });
  alvo.querySelectorAll('[data-todos]').forEach(t => t.onchange = () => {
    alvo.querySelectorAll(`[data-m^="${t.dataset.todos}:"]`).forEach(cb => { cb.checked = t.checked; cb.checked ? marcados.add(cb.dataset.m) : marcados.delete(cb.dataset.m); });
    atualizar();
  });
  alvo.querySelector('#pagar')?.addEventListener('click', () => {
    const r = rets.filter(x => marcados.has('r:' + x.id)), c = cons.filter(x => marcados.has('c:' + x.id));
    pagar(r, c, +fFac, (r[0] || c[0]).faccao, () => { marcados.clear(); render(el); });
  });
}

function preco(r) {
  const p = [];
  if (r.valor_cima != null) p.push(r.valor_baixo != null ? `cima ${moeda(r.valor_cima)}` : moeda(r.valor_cima));
  if (r.valor_baixo != null) p.push(r.valor_cima != null ? `baixo ${moeda(r.valor_baixo)}` : moeda(r.valor_baixo));
  return p.join(' · ') || '—';
}

function pagar(rets, cons, faccaoId, faccao, depois) {
  const bruto = rets.reduce((a, r) => a + Number(r.valor_a_pagar), 0) + cons.reduce((a, c) => a + Number(c.valor), 0);
  const tk = token();
  modal({
    titulo: `Pagamento — ${faccao}`,
    corpo: `<p>${rets.length ? `${rets.length} retorno(s)` : ''}${rets.length && cons.length ? ' + ' : ''}${cons.length ? `${cons.length} conserto(s) recebido(s)` : ''} · valor bruto <b>${moeda(bruto)}</b></p>
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
        if (!await confirmar('Confirmar pagamento', `Registrar pagamento de <b>${moeda(liq)}</b> para <b>${h(faccao)}</b>?`)) return false;
        const r = await chamar(db, 'registrar_fechamento', {
          p_faccao_id: faccaoId, p_retorno_ids: rets.map(x => x.id), p_conserto_ids: cons.map(x => x.id),
          p_data_pagamento: m.querySelector('#dp').value, p_desconto: ds, p_responsavel: m.querySelector('#rs').value,
          p_token: tk, p_valor_pago_esperado: liq, p_obs: m.querySelector('#ob').value || null, p_comprovante_url: m.querySelector('#cp').value || null });
        if (!r) return false;
        toast(`Pagamento ${r.codigo} registrado: ${moeda(r.valor_pago)}.`, 'ok'); depois();
      }
    }]
  });
}

async function renderPendencias(alvo) {
  let q1 = db.from('v_retornos').select('*').in('situacao', ['REVISAR', 'A CONFERIR', 'SEM VALOR']).order('data_retorno');
  let q2 = db.from('v_consertos').select('*').eq('situacao_pagamento', 'EM CONSERTO').order('data');
  if (fFac) { q1 = q1.eq('faccao_id', +fFac); q2 = q2.eq('faccao_id', +fFac); }
  const [rets, cons] = await Promise.all([ler(q1), ler(q2)]);
  alvo.innerHTML = `
    <h2>Retornos com pendência</h2>
    <div class="tabela-wrap"><table><thead><tr><th>Facção</th><th>Lote</th><th>Produto</th><th>Cor/Tam</th><th>Retorno</th><th class="n">Retornadas</th><th class="n">Defeito</th><th class="n">Conserto</th><th>Motivo</th></tr></thead>
      <tbody>${rets.map(r => `<tr><td>${h(r.faccao)}</td><td>${h(r.lote)}</td><td>${h(r.produto)}</td><td>${h(r.cor || '')} / ${h(r.tamanho || '')}</td><td>${data(r.data_retorno)}</td>
        <td class="n">${r.ret_cima + r.ret_baixo}</td><td class="n">${r.def_cima + r.def_baixo}</td><td class="n">${r.cons_cima + r.cons_baixo}</td>
        <td>${chip(r.motivo || r.situacao, r.situacao === 'SEM VALOR' ? 'info' : 'alerta')}</td></tr>`).join('') || '<tr><td colspan="9" class="vazio">Nenhuma pendência.</td></tr>'}</tbody></table></div>
    <h2 style="margin-top:16px">Consertos ainda na facção</h2>
    <p class="muted peq">Serão pagos quando forem marcados como recebidos em Consertos.</p>
    <div class="tabela-wrap"><table><thead><tr><th>Facção</th><th>Enviado p/ conserto</th><th>Lote</th><th>Produto</th><th>Cor/Tam</th><th class="n">Peças</th><th class="n">Valor</th></tr></thead>
      <tbody>${cons.map(c => `<tr><td>${h(c.faccao)}</td><td>${data(c.data)}</td><td>${h(c.lote)}</td><td>${h(c.produto)}</td><td>${h(c.cor || '')} / ${h(c.tamanho || '')}</td>
        <td class="n">${num(c.qtd)}</td><td class="n">${moeda(c.valor)}</td></tr>`).join('') || '<tr><td colspan="7" class="vazio">Nenhum conserto pendente.</td></tr>'}</tbody></table></div>`;
}

async function renderPagos(alvo, el) {
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
    const motivo = await pedirTexto(`Estornar pagamento ${p.codigo}`, `Estornar o pagamento de <b>${moeda(p.valor_pago)}</b> para <b>${h(p.faccao)}</b>? Os itens voltam para "A pagar".`, { botao: 'Estornar', minimo: 5 });
    if (motivo && await chamar(db, 'estornar_fechamento', { p_fechamento_id: p.id, p_motivo: motivo })) { toast('Pagamento estornado.', 'ok'); render(el); }
  });
}

async function detalhes(p) {
  const [rets, cons] = await Promise.all([
    ler(db.from('v_retornos').select('*').eq('fechamento_id', p.id)),
    ler(db.from('v_consertos').select('*').eq('fechamento_id', p.id)),
  ]);
  modal({
    titulo: `${p.codigo} — ${p.faccao}`, largo: true,
    corpo: `<p>Pago em ${data(p.data_pagamento)} por ${h(p.responsavel)} · bruto ${moeda(p.valor_bruto)} · desconto ${moeda(p.desconto)} · <b>pago ${moeda(p.valor_pago)}</b></p>
      ${p.obs ? `<p>Obs.: ${h(p.obs)}</p>` : ''}
      ${rets.length ? `<h3>Retornos</h3><div class="tabela-wrap"><table><thead><tr><th>Lote</th><th>Produto</th><th>Cor/Tam</th><th class="n">Retornadas</th><th class="n">Defeito</th><th class="n">Conserto</th><th class="n">Bruto</th><th class="n">Pago</th></tr></thead>
      <tbody>${rets.map(r => `<tr><td>${h(r.lote)}</td><td>${h(r.produto)}</td><td>${h(r.cor || '')} / ${h(r.tamanho || '')}</td><td class="n">${r.ret_cima + r.ret_baixo}</td>
        <td class="n">${r.def_cima + r.def_baixo}</td><td class="n">${r.cons_cima + r.cons_baixo}</td><td class="n">${moeda(r.valor_a_pagar)}</td><td class="n">${moeda(r.valor_pago)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${cons.length ? `<h3 style="margin-top:12px">Consertos</h3><div class="tabela-wrap"><table><thead><tr><th>Lote</th><th>Produto</th><th>Cor/Tam</th><th>Recebido em</th><th class="n">Peças</th><th class="n">Pago</th></tr></thead>
      <tbody>${cons.map(c => `<tr><td>${h(c.lote)}</td><td>${h(c.produto)}</td><td>${h(c.cor || '')} / ${h(c.tamanho || '')}</td><td>${data(c.data_recebido)}</td>
        <td class="n">${num(c.qtd)}</td><td class="n">${moeda(c.valor_pago)}</td></tr>`).join('')}</tbody></table></div>` : ''}`,
    botoes: [{ texto: 'Fechar' }]
  });
}
