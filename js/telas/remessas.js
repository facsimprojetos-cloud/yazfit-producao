import { db, tem } from '../app.js';
import { h, num, moeda, data, dataHora, modal, chamar, ler, cadastros, opcoes, toast, pedirTexto } from '../util.js';
import { imprimirRomaneio } from '../romaneio.js';

let busca = '';

export async function render(el) {
  const pode = tem('faccao');
  const sup = tem('supervisor');
  const lista = await ler(db.from('v_remessas').select('*').order('numero', { ascending: false }).limit(300));
  const f = lista.filter(r => !busca || [r.numero, r.faccao, r.lotes].join(' ').toLowerCase().includes(busca.toLowerCase()));
  el.innerHTML = `
    <div class="cab"><div><h1>Romaneios</h1><p>Histórico de envios para facção: reimpressão e correção de destino.</p></div></div>
    <div class="filtros"><label class="campo">Buscar<input id="b" value="${h(busca)}" placeholder="Nº, facção, lote…"></label></div>
    <div class="tabela-wrap"><table>
      <thead><tr><th>Nº</th><th>Data</th><th>Facção</th><th>Lotes</th><th class="n">Variações</th><th class="n">Peças</th><th class="n">Valor</th><th>Previsão</th><th></th></tr></thead>
      <tbody>${f.map(r => `<tr>
        <td class="forte">${h(r.numero)}</td><td>${dataHora(r.data_envio)}</td><td>${h(r.faccao)}</td><td class="peq">${h(r.lotes || '')}</td>
        <td class="n">${num(r.variacoes)}</td><td class="n">${num(r.qtd_total)}</td><td class="n">${moeda(r.valor_total)}</td><td>${data(r.previsao)}</td>
        <td><div class="acoes"><button class="btn peq" data-imp="${r.id}">🖨️</button>${pode ? `<button class="btn peq" data-ed="${r.id}">Editar</button><button class="btn peq" data-troca="${r.id}">Trocar facção</button>` : ''}${sup ? `<button class="btn peq perigo" data-ex="${r.id}">🗑</button>` : ''}</div></td>
      </tr>`).join('') || '<tr><td colspan="9" class="vazio">Nenhum romaneio.</td></tr>'}</tbody></table></div>`;
  el.querySelector('#b').onchange = (e) => { busca = e.target.value; render(el); };
  el.querySelectorAll('[data-imp]').forEach(b => b.onclick = () => imprimirRomaneio(b.dataset.imp));
  el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => {
    const r = lista.find(x => x.id === b.dataset.ed);
    modal({
      titulo: `Editar romaneio nº ${r.numero}`,
      corpo: `<div class="grade"><label class="campo">Previsão de retorno<input type="date" id="pv" value="${r.previsao}"></label>
        <label class="campo">Observação<input id="ob" value="${h(r.obs || '')}"></label></div>
        <p class="muted peq">A nova previsão vale para todos os itens ainda não retornados deste romaneio.</p>`,
      botoes: [{ texto: 'Cancelar' }, { texto: 'Salvar', classe: 'pri', acao: async (m) => {
        if (!await chamar(db, 'editar_remessa', { p_remessa_id: r.id, p_previsao: m.querySelector('#pv').value || null, p_obs: m.querySelector('#ob').value || null })) return false;
        toast('Romaneio atualizado.', 'ok'); render(el);
      } }]
    });
  });
  el.querySelectorAll('[data-ex]').forEach(b => b.onclick = async () => {
    const r = lista.find(x => x.id === b.dataset.ex);
    const motivo = await pedirTexto(`Excluir romaneio nº ${r.numero}`, `Excluir o romaneio inteiro (<b>${num(r.qtd_total)}</b> peças para <b>${h(r.faccao)}</b>)? As peças voltam para o saldo dos sublotes. Só é possível se não houver retornos.`, { botao: 'Excluir romaneio' });
    if (motivo && await chamar(db, 'excluir_remessa', { p_remessa_id: r.id, p_motivo: motivo })) { toast('Romaneio excluído.', 'ok'); render(el); }
  });
  el.querySelectorAll('[data-troca]').forEach(b => b.onclick = async () => {
    const r = lista.find(x => x.id === b.dataset.troca);
    const cad = await cadastros(db);
    modal({
      titulo: `Trocar facção — romaneio nº ${r.numero}`,
      corpo: `<p>Atual: <b>${h(r.faccao)}</b>. Só é permitido se ainda não houve nenhum retorno.</p>
        <label class="campo">Nova facção<select id="nf">${opcoes(cad.faccoes.filter(x => x.ativo && x.id !== r.faccao_id), null)}</select></label>
        <label class="campo" style="margin-top:8px">Motivo (mín. 8 caracteres)<input id="mt"></label>`,
      botoes: [{ texto: 'Cancelar' }, {
        texto: 'Trocar', classe: 'pri', acao: async (m) => {
          const nf = +m.querySelector('#nf').value, mt = m.querySelector('#mt').value.trim();
          if (!nf) { toast('Escolha a nova facção.', 'erro'); return false; }
          if (mt.length < 8) { toast('Informe o motivo (mín. 8 caracteres).', 'erro'); return false; }
          if (!await chamar(db, 'trocar_faccao_remessa', { p_remessa_id: r.id, p_nova_faccao: nf, p_motivo: mt })) return false;
          toast('Facção alterada.', 'ok'); render(el);
        }
      }]
    });
  });
}
