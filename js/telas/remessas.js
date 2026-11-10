import { db, tem } from '../app.js';
import { h, num, moeda, data, dataHora, modal, chamar, ler, cadastros, opcoes, toast } from '../util.js';
import { imprimirRomaneio } from '../romaneio.js';

let busca = '';

export async function render(el) {
  const pode = tem('faccao');
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
        <td><div class="acoes"><button class="btn peq" data-imp="${r.id}">🖨️</button>${pode ? `<button class="btn peq" data-troca="${r.id}">Trocar facção</button>` : ''}</div></td>
      </tr>`).join('') || '<tr><td colspan="9" class="vazio">Nenhum romaneio.</td></tr>'}</tbody></table></div>`;
  el.querySelector('#b').onchange = (e) => { busca = e.target.value; render(el); };
  el.querySelectorAll('[data-imp]').forEach(b => b.onclick = () => imprimirRomaneio(b.dataset.imp));
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
