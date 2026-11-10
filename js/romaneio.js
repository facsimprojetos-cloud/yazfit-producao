import { db } from './app.js';
import { EMPRESA } from './config.js';
import { h, num, moeda, data, dataHora, ler, imprimirHtml } from './util.js';

// Imprime o romaneio (A4) de uma remessa
export async function imprimirRomaneio(remessaId) {
  const [rem] = await ler(db.from('v_remessas').select('*').eq('id', remessaId));
  const itens = await ler(db.from('v_envios').select('*').eq('remessa_id', remessaId).order('lote').order('sublote'));
  if (!rem) return;
  const linhas = itens.map(e => `<tr>
    <td>${h(e.lote)}</td><td>${h(e.sublote)}</td><td>${h(e.produto)}</td><td>${h(e.cor || '')}</td><td>${h(e.tamanho || '')}</td>
    <td style="text-align:right">${num(e.qtd)}</td>
    <td style="text-align:right">${e.valor_cima != null ? moeda(e.valor_cima) : '—'}</td>
    <td style="text-align:right">${e.valor_baixo != null ? moeda(e.valor_baixo) : '—'}</td>
    <td style="text-align:right">${moeda(e.valor_total)}</td></tr>`).join('');
  imprimirHtml(`<div class="romaneio">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><h1>${h(EMPRESA)} — ROMANEIO DE ENVIO Nº ${h(rem.numero)}</h1>
        <div>Facção: <b>${h(rem.faccao)}</b></div></div>
      <div style="text-align:right">Envio: <b>${dataHora(rem.data_envio)}</b><br>Previsão de retorno: <b>${data(rem.previsao)}</b></div>
    </div>
    <table><thead><tr><th>Lote</th><th>Sublote</th><th>Produto</th><th>Cor</th><th>Tam.</th><th>Qtd</th><th>R$ cima</th><th>R$ baixo</th><th>Total</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><th colspan="5" style="text-align:right">Totais</th><th style="text-align:right">${num(rem.qtd_total)}</th><th colspan="2"></th><th style="text-align:right">${moeda(rem.valor_total)}</th></tr></tfoot>
    </table>
    ${rem.obs ? `<p>Obs.: ${h(rem.obs)}</p>` : ''}
    <div class="assin"><div>Responsável pelo envio</div><div>Facção (recebido em ___/___/____)</div></div>
  </div>`);
}
